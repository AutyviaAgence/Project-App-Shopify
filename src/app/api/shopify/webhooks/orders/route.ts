import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'
import type { TriggerEvent } from '@/lib/automations/types'

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
  // refunds/create encapsule la commande dans `order` ou expose order_id.
  const order: ShopifyOrder = topic === 'refunds/create'
    ? (payload.order || payload.order_adjustments?.[0] || payload)
    : payload

  const ctx = await buildOrderContext(userId, order, mapping.status, true)
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  const { queued } = await enqueueAutomations({ userId, event: mapping.event, ctx })
  return NextResponse.json({ received: true, queued })
}
