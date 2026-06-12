import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'

/**
 * Webhook Shopify — checkouts/create (panier abandonné).
 *
 * On enfile un job différé (délai de la règle, ex: 1h). Au dépilement, le cron
 * vérifie qu'aucune commande n'a été passée entre-temps par ce contact (sinon
 * skip) — c'est ce qui distingue un VRAI panier abandonné d'un achat finalisé.
 *
 * L'abandon_url permet de renvoyer le client finaliser son panier.
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

  const checkout = JSON.parse(rawBody || '{}') as ShopifyOrder & { abandoned_checkout_url?: string }
  const ctx = await buildOrderContext(userId, checkout, 'Panier en attente')
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  // Lien de reprise du panier
  if (checkout.abandoned_checkout_url) ctx.variables.cart_url = checkout.abandoned_checkout_url

  const { queued } = await enqueueAutomations({ userId, event: 'checkout_abandoned', ctx })
  return NextResponse.json({ received: true, queued })
}
