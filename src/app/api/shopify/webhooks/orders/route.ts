import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac, fetchOrderById } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'
import { persistShopifyOrder } from '@/lib/shopify/persist-order'
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
  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ;
  // si null, on renvoie null → l'appelant répond 200 « commande introuvable »
  // (Shopify retenterait en boucle sur un non-200).
  const token = await getValidAccessToken(shopDomain)
  if (!token) {
    console.error('[webhook orders] jeton Shopify invalide pour', shopDomain,
      '→ rouvrir l’app depuis l’admin Shopify pour la reconnecter')
    return null
  }
  const res = await fetchOrderById(shopDomain, token, orderId)
  if (!res.ok) {
    console.error('[webhook orders] fetch commande échec:', res.error)
    return null
  }
  return res.order as ShopifyOrder
}

/**
 * Le panier a abouti à une commande → on annule sa relance d'abandon.
 *
 * Une commande Shopify porte le `checkout_token` du panier dont elle est issue.
 * On s'en sert pour retrouver les jobs de relance de CE panier (leur dedup_key
 * vaut `checkout_abandoned:cart:<token>`, cf. webhook checkouts) et les
 * neutraliser avant qu'ils ne partent.
 *
 * Pourquoi par token et pas par date : Shopify émet `checkouts/create` et
 * `orders/create` quasi simultanément. Tout garde-fou fondé sur « la commande
 * est-elle postérieure au job ? » perd la course dès que la commande arrive en
 * premier. Le token, lui, ne dépend d'aucun ordre d'arrivée.
 *
 * Best-effort : un échec ici ne doit pas faire retenter le webhook (le cron
 * revérifie de toute façon avant d'envoyer).
 */
async function cancelAbandonedCartJobs(userId: string, order: ShopifyOrder & { checkout_token?: string }) {
  const token = order.checkout_token
  if (!token) return
  try {
    const admin = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await admin
      .from('automation_jobs')
      .update({
        status: 'skipped',
        result: 'panier finalisé (commande passée)',
        processed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('dedup_key', `checkout_abandoned:cart:${token}`)
      .in('status', ['pending', 'waiting'])
    if (error) console.error('[webhook orders] annulation relance panier:', error.message)
  } catch (err) {
    console.error('[webhook orders] annulation relance panier:', err)
  }
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
  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''

  // Trace d'arrivée. Sans elle, « commande payée ne marche pas » est
  // indiagnosticable : impossible de distinguer « Shopify n'a jamais appelé » de
  // « appelé, mais aucun contact rattaché ». Aucune PII : topic + boutique.
  console.log(`[webhook orders] ${shopDomain} topic=${topic}`)

  const mapping = TOPIC_TO_EVENT[topic]
  if (!mapping) return NextResponse.json({ received: true, skipped: `topic ${topic}` })

  const userId = await resolveStoreUser(shopDomain)
  if (!userId) {
    console.warn(`[webhook orders] boutique inconnue ou inactive: ${shopDomain}`)
    return NextResponse.json({ received: true })
  }

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

  // Persiste la commande pour les stats de ventes (best-effort, non bloquant).
  // On le fait avant les automatisations pour ne rien perdre même sans contact.
  await persistShopifyOrder(userId, shopDomain, order)

  // ⚠️ LE PANIER EST PAYÉ → ON ANNULE SA RELANCE D'ABANDON.
  //
  // C'est ici que se règle « relance de panier abandonné reçue alors que le
  // panier était validé ». L'ancien garde-fou comparait `last_order_at` à la
  // date du job : Shopify émettant `checkouts/create` et `orders/create`
  // quasi simultanément, la commande pouvait arriver AVANT le job — la
  // comparaison ne voyait rien et la relance partait.
  //
  // La commande porte le `checkout_token` du panier dont elle est issue : on
  // annule les relances de CE panier, sans dépendre de l'ordre d'arrivée des
  // webhooks ni d'une fenêtre de temps.
  await cancelAbandonedCartJobs(userId, order)

  const ctx = await buildOrderContext(userId, order, mapping.status, true)
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  const { queued } = await enqueueAutomations({ userId, event: mapping.event, ctx })
  return NextResponse.json({ received: true, queued })
}
