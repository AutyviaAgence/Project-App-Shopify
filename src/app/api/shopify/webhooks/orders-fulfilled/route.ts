import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'

/**
 * Webhook Shopify — orders/fulfilled
 * Déclenché quand une commande est expédiée. On enfile l'événement
 * d'automatisation "order_fulfilled" : le marchand branche son propre message
 * (suivi de colis) via une automatisation, avec délai/conditions.
 *
 * Le contact + le numéro sont résolus par buildOrderContext (même cascade
 * robuste que les autres webhooks commande : customer.phone n'est pas toujours
 * rempli, on retombe sur order.phone / shipping_address / contact opt-in).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const userId = await resolveStoreUser(shopDomain)
  if (!userId) return NextResponse.json({ received: true })

  const order = JSON.parse(rawBody || '{}') as ShopifyOrder

  // Contexte d'événement (contact + variables) via la cascade robuste.
  // isRealOrder=true : l'expédition confirme une commande → on note last_order_at
  // (annule une éventuelle relance de panier abandonné encore en file).
  const ctx = await buildOrderContext(userId, order, 'Expédiée', true)
  let queued = 0
  if (ctx) {
    queued = (await enqueueAutomations({ userId, event: 'order_fulfilled', ctx })).queued
  }

  // Déclencheur campagne auto : événement Shopify "order_fulfilled"
  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: autoCampaigns } = await admin
    .from('campaigns')
    .select('id')
    .eq('user_id', userId)
    .eq('campaign_mode', 'auto')
    .eq('is_active', true)
    .eq('trigger_type', 'shopify_event')
    .eq('trigger_event', 'order_fulfilled')
  if (autoCampaigns && autoCampaigns.length > 0) {
    const { startCampaignExecution } = await import('@/lib/campaigns/executor')
    for (const c of autoCampaigns) {
      await admin.from('campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', c.id)
      startCampaignExecution(c.id)
    }
  }

  return NextResponse.json({ received: true, queued })
}
