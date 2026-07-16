import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac, fetchOrderById } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { enqueueAutomations } from '@/lib/automations/engine'
import { buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'

/**
 * Webhook Shopify — fulfillment_events/create
 *
 * Se déclenche à chaque changement de statut d'expédition chez le transporteur
 * (in_transit, out_for_delivery, delivered…). On ne s'intéresse qu'à
 * `delivered` → on émet l'événement d'automatisation `order_delivered` (le
 * pendant précis de « livraison »).
 *
 * ⚠️ Ne se déclenche QUE si le transporteur transmet ses événements à Shopify
 * (souvent absent en France avec Colissimo). D'où l'alternative fiable :
 * automatisation « Commande expédiée + délai ».
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const event = JSON.parse(rawBody || '{}') as { status?: string; order_id?: number | string }

  // Trace d'arrivée. Sans elle, « le trigger Livré ne marche pas » est
  // indiagnosticable : on ne sait pas distinguer « Shopify n'a jamais appelé »
  // de « appelé, mais le statut n'était pas delivered ». Aucune PII ici (ni
  // téléphone ni email) : juste le statut et l'id de commande.
  console.log(`[webhook fulfillment-events] ${shopDomain} status=${event.status} order=${event.order_id}`)

  // On ne réagit qu'à la livraison effective.
  if (String(event.status || '').toLowerCase() !== 'delivered') {
    return NextResponse.json({ received: true, ignored: 'status non-delivered' })
  }
  if (!event.order_id) return NextResponse.json({ received: true })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Boutique + token (le payload fulfillment_event ne contient pas la commande
  // complète → on la récupère par order_id pour bâtir le contexte).
  const { data: store } = await admin
    .from('shopify_stores')
    .select('user_id, shop_domain, access_token')
    .eq('shop_domain', shopDomain)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.user_id || !store.access_token) return NextResponse.json({ received: true })

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ;
  // si null, on log et on renvoie 200 (Shopify retenterait en boucle sur un non-200).
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    console.error('[webhook fulfillment-events] jeton Shopify invalide pour', store.shop_domain,
      '→ rouvrir l’app depuis l’admin Shopify pour la reconnecter')
    return NextResponse.json({ received: true, error: 'jeton Shopify invalide' })
  }
  const orderRes = await fetchOrderById(store.shop_domain, token, event.order_id)
  if (!orderRes.ok) return NextResponse.json({ received: true, error: 'order introuvable' })

  const order = orderRes.order as unknown as ShopifyOrder
  const ctx = await buildOrderContext(store.user_id, order, 'Livrée', true)
  let queued = 0
  if (ctx) {
    queued = (await enqueueAutomations({ userId: store.user_id, event: 'order_delivered', ctx })).queued
  }

  // Déclencheur campagne auto : événement "order_delivered".
  const { data: autoCampaigns } = await admin
    .from('campaigns')
    .select('id')
    .eq('user_id', store.user_id)
    .eq('campaign_mode', 'auto')
    .eq('is_active', true)
    .eq('trigger_type', 'shopify_event')
    .eq('trigger_event', 'order_delivered')
  if (autoCampaigns && autoCampaigns.length > 0) {
    const { startCampaignExecution } = await import('@/lib/campaigns/executor')
    for (const c of autoCampaigns) {
      await admin.from('campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', c.id)
      startCampaignExecution(c.id)
    }
  }

  return NextResponse.json({ received: true, queued })
}
