import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { enqueueAutomations } from '@/lib/automations/engine'
import { resolveStoreUser, buildOrderContext, type ShopifyOrder } from '@/lib/automations/shopify-context'

/**
 * Webhook Shopify — checkouts/create (panier abandonné).
 *
 * On enfile un job différé (délai de la règle, ex: 1h). Au dépilement, le cron
 * revérifie que CE checkout n'a pas été finalisé entre-temps (voir
 * run-automations) — c'est ce qui distingue un VRAI panier abandonné d'un achat
 * qui a abouti.
 *
 * ── DEUX PIÈGES DE CE WEBHOOK ───────────────────────────────────────────────
 *
 * 1. Shopify émet `checkouts/create` À CHAQUE mise à jour du panier, pas
 *    seulement une fois. Sans dédup stable, un client qui ajuste son panier
 *    trois fois recevait trois relances. L'`id` du checkout change à chaque
 *    émission ; le `token`, lui, identifie le panier de bout en bout — c'est
 *    donc lui la clé.
 *
 * 2. `completed_at` est renseigné dès que le checkout aboutit. Un panier déjà
 *    payé n'a rien à faire dans une file de relance : on sort tout de suite.
 *    (Cf. doc Shopify : « For abandoned checkouts, this value is null until a
 *    customer completes the checkout ».)
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

  const checkout = JSON.parse(rawBody || '{}') as ShopifyOrder & {
    abandoned_checkout_url?: string
    completed_at?: string | null
    token?: string
    cart_token?: string
  }

  // Panier DÉJÀ payé → ce n'est pas un abandon. On n'enfile rien.
  if (checkout.completed_at) {
    return NextResponse.json({ received: true, skipped: 'checkout déjà finalisé' })
  }

  const ctx = await buildOrderContext(userId, checkout, 'Panier en attente')
  if (!ctx) return NextResponse.json({ received: true, skipped: 'no contact/phone' })

  // Lien de reprise du panier
  if (checkout.abandoned_checkout_url) ctx.variables.cart_url = checkout.abandoned_checkout_url

  // Dédup par TOKEN de panier : une seule relance par panier, quel que soit le
  // nombre de fois où le client le modifie. `buildOrderContext` pose par défaut
  // l'id du checkout, qui lui change à chaque émission → doublons.
  const cartToken = checkout.token || checkout.cart_token
  // Le token voyage jusqu'au cron : il lui sert à vérifier, au moment d'envoyer,
  // que ce panier précis n'a pas été payé entre-temps.
  if (cartToken) {
    ctx.dedupKey = `cart:${cartToken}`
    ctx.cartToken = cartToken
  }
  // Date du panier : référence du cron pour juger si une commande est arrivée
  // depuis (la date du job ne convient pas — la commande peut la précéder).
  if (checkout.created_at) ctx.cartCreatedAt = checkout.created_at

  const { queued } = await enqueueAutomations({ userId, event: 'checkout_abandoned', ctx })
  return NextResponse.json({ received: true, queued })
}
