import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac, fetchOrderById } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'
import type { TriggerEvent } from '@/lib/automations/types'

/**
 * Récupère la commande complète associée à un remboursement, via l'Admin API.
 * (Le webhook refunds/create ne fournit que order_id + lignes remboursées.)
 */
async function fetchRefundOrder(shopDomain: string, orderId: string | number): Promise<ShopifyOrder | null> {
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
    console.error('[refunds] fetch commande échec:', res.error)
    return null
  }
  return res.order as ShopifyOrder
}

/**
 * Webhook Shopify unifié — orders/create, orders/paid, orders/cancelled,
 * refunds/create. Le topic est dans le header x-shopify-topic.
 *
 * On mappe le topic vers un événement d'automatisation et on enfile les jobs
 * correspondants (envoi immédiat ou différé selon le délai de la règle).
 */
const TOPIC_TO_EVENT: Record<string, { event: TriggerEvent; status: string }> = {
  'orders/create': { event: 'order_created', status: 'En préparation' },
  'orders/paid': { event: 'order_paid', status: 'Payée' },
  'orders/cancelled': { event: 'order_cancelled', status: 'Annulée' },
  'refunds/create': { event: 'refund_created', status: 'Remboursée' },
}

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

  // refunds/create : le payload est un objet REFUND (order_id + lignes
  // remboursées), PAS une commande. On récupère donc la commande complète
  // via l'Admin API pour avoir le client, le numéro et le montant.
  let order: ShopifyOrder = payload
  if (topic === 'refunds/create') {
    const orderId = payload.order_id || payload.order?.id
    if (!orderId) return NextResponse.json({ received: true, skipped: 'refund sans order_id' })
    const fetched = await fetchRefundOrder(shopDomain, orderId)
    if (!fetched) return NextResponse.json({ received: true, skipped: 'commande du remboursement introuvable' })
    order = fetched
  }

  const ctx = await buildOrderContext(userId, order, mapping.status, true)
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  const { queued } = await enqueueAutomations({ userId, event: mapping.event, ctx })
  return NextResponse.json({ received: true, queued })
}
