import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac, fetchOrderById } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'
import type { TriggerEvent } from '@/lib/automations/types'

/**
 * Récupère la commande complète par son ID, via l'Admin API. Utile pour les
 * webhooks dont le payload n'est PAS une commande complète (refunds/create,
 * returns/request) : ils ne portent qu'un order_id + des lignes.
 */
async function fetchOrderForWebhook(shopDomain: string, orderId: string | number): Promise<ShopifyOrder | null> {
  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: store } = await admin
    .from('shopify_stores')
    .select('access_token')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  if (!store?.access_token) return null
  const token = decryptMessage(store.access_token)
  const res = await fetchOrderById(shopDomain, token, orderId)
  if (!res.ok) {
    console.error('[webhook orders] fetch commande échec:', res.error)
    return null
  }
  return res.order as ShopifyOrder
}

/**
 * Webhook Shopify unifié — orders/create, orders/paid, orders/cancelled,
 * refunds/create, returns/request. Le topic est dans le header x-shopify-topic.
 *
 * On mappe le topic vers un événement d'automatisation et on enfile les jobs
 * correspondants (envoi immédiat ou différé selon le délai de la règle).
 */
const TOPIC_TO_EVENT: Record<string, { event: TriggerEvent; status: string }> = {
  'orders/create': { event: 'order_created', status: 'En préparation' },
  'orders/paid': { event: 'order_paid', status: 'Payée' },
  'orders/cancelled': { event: 'order_cancelled', status: 'Annulée' },
  'refunds/create': { event: 'refund_created', status: 'Remboursée' },
  'returns/request': { event: 'return_requested', status: 'Retour demandé' },
}

// Topics dont le payload ne contient PAS la commande complète → fetch via API.
const NEEDS_ORDER_FETCH = new Set(['refunds/create', 'returns/request'])

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const topic = (req.headers.get('x-shopify-topic') || '').toLowerCase()
  const mapping = TOPIC_TO_EVENT[topic]
  if (!mapping) return NextResponse.json({ received: true, skipped: `topic ${topic}` })

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const userId = await resolveStoreUser(shopDomain)
  if (!userId) return NextResponse.json({ received: true })

  const payload = JSON.parse(rawBody || '{}')

  // refunds/create et returns/request : le payload n'est PAS une commande
  // complète (juste order_id + lignes). On récupère la commande via l'Admin API
  // pour avoir le client, le numéro et le montant.
  let order: ShopifyOrder = payload
  if (NEEDS_ORDER_FETCH.has(topic)) {
    const orderId = payload.order_id || payload.order?.id
    if (!orderId) return NextResponse.json({ received: true, skipped: `${topic} sans order_id` })
    const fetched = await fetchOrderForWebhook(shopDomain, orderId)
    if (!fetched) return NextResponse.json({ received: true, skipped: 'commande introuvable' })
    order = fetched
  }

  const ctx = await buildOrderContext(userId, order, mapping.status, true)
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  const { queued } = await enqueueAutomations({ userId, event: mapping.event, ctx })
  return NextResponse.json({ received: true, queued })
}
