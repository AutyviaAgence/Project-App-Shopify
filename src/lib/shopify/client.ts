import 'server-only'
import crypto from 'crypto'

/**
 * Client Shopify (Admin API + OAuth) — server-only.
 * Gère le flux d'installation OAuth, la vérification HMAC, l'échange du
 * code contre un access_token, et les appels Admin API (catalogue, etc.).
 */

const API_VERSION = '2026-04'

export function getShopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET
  const scopes = process.env.SHOPIFY_SCOPES || 'read_products,read_content,read_orders,read_customers,read_returns,read_legal_policies'
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'
  return { apiKey, apiSecret, scopes, appUrl }
}

/** Valide un nom de boutique (xxx.myshopify.com) pour éviter les injections. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
}

/** Construit l'URL d'autorisation OAuth vers laquelle rediriger le marchand. */
export function buildAuthUrl(shop: string, state: string): string {
  const { apiKey, scopes, appUrl } = getShopifyConfig()
  const redirectUri = `${appUrl}/api/shopify/callback`
  const params = new URLSearchParams({
    client_id: apiKey || '',
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

/**
 * Vérifie le HMAC d'une requête Shopify (callback OAuth ou webhook query).
 * Shopify signe les paramètres avec le secret de l'app.
 */
export function verifyHmac(query: Record<string, string>, providedHmac: string): boolean {
  const { apiSecret } = getShopifyConfig()
  if (!apiSecret || !providedHmac) return false

  // Reconstruire le message : tous les params sauf hmac/signature, triés
  const message = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&')

  const digest = crypto.createHmac('sha256', apiSecret).update(message).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(providedHmac, 'hex'))
  } catch {
    return false
  }
}

/** Vérifie la signature HMAC d'un webhook (header X-Shopify-Hmac-Sha256, body brut). */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string): boolean {
  const { apiSecret } = getShopifyConfig()
  if (!apiSecret || !hmacHeader) return false
  const digest = crypto.createHmac('sha256', apiSecret).update(rawBody, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

/** Échange le code d'autorisation contre un access_token permanent. */
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ ok: true; accessToken: string; scope: string } | { ok: false; error: string }> {
  const { apiKey, apiSecret } = getShopifyConfig()
  if (!apiKey || !apiSecret) return { ok: false, error: 'Config Shopify manquante' }

  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }
    const data = await res.json()
    return { ok: true, accessToken: data.access_token, scope: data.scope }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/** Appel générique à l'Admin API GraphQL de Shopify. */
export async function shopifyGraphQL<T = unknown>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }
    const json = await res.json()
    if (json.errors) return { ok: false, error: JSON.stringify(json.errors) }
    return { ok: true, data: json.data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/**
 * Récupère une commande complète par son ID via l'Admin API REST.
 * Utile pour les webhooks dont le payload n'est pas une commande complète
 * (ex: refunds/create, qui ne contient que order_id + lignes remboursées).
 * Le format REST (snake_case) est compatible avec le type ShopifyOrder.
 */
export async function fetchOrderById(
  shop: string,
  accessToken: string,
  orderId: string | number
): Promise<{ ok: true; order: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    )
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }
    const json = await res.json()
    if (!json.order) return { ok: false, error: 'order absent de la réponse' }
    return { ok: true, order: json.order as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/** Récupère les infos de base de la boutique (nom, devise, pays, email). */
export async function fetchShopInfo(shop: string, accessToken: string) {
  return shopifyGraphQL<{ shop: { name: string; email: string; currencyCode: string; billingAddress: { country: string | null } } }>(
    shop,
    accessToken,
    `{ shop { name email currencyCode billingAddress { country } } }`
  )
}

/**
 * Abonne la boutique aux webhooks "métier" via l'Admin API (à appeler après
 * l'OAuth). Les webhooks RGPD obligatoires se déclarent côté config app.
 */
export async function registerWebhooks(shop: string, accessToken: string): Promise<{ ok: boolean; errors: string[] }> {
  const { appUrl } = getShopifyConfig()
  const subscriptions: { topic: string; path: string }[] = [
    { topic: 'ORDERS_FULFILLED', path: '/api/shopify/webhooks/orders-fulfilled' },
    // Événements d'automatisation
    { topic: 'ORDERS_CREATE', path: '/api/shopify/webhooks/orders' },
    { topic: 'ORDERS_PAID', path: '/api/shopify/webhooks/orders' },
    { topic: 'ORDERS_CANCELLED', path: '/api/shopify/webhooks/orders' },
    { topic: 'REFUNDS_CREATE', path: '/api/shopify/webhooks/orders' },
    { topic: 'RETURNS_REQUEST', path: '/api/shopify/webhooks/orders' },
    { topic: 'CHECKOUTS_CREATE', path: '/api/shopify/webhooks/checkouts' },
    // Synchro RAG : catalogue (temps réel) + infos boutique (pages/politiques)
    { topic: 'PRODUCTS_CREATE', path: '/api/shopify/webhooks/products' },
    { topic: 'PRODUCTS_UPDATE', path: '/api/shopify/webhooks/products' },
    { topic: 'PRODUCTS_DELETE', path: '/api/shopify/webhooks/products' },
    { topic: 'SHOP_UPDATE', path: '/api/shopify/webhooks/shop' },
  ]

  const errors: string[] = []
  for (const sub of subscriptions) {
    const res = await shopifyGraphQL<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(
      shop,
      accessToken,
      `mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
         webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
           userErrors { message }
         }
       }`,
      { topic: sub.topic, url: `${appUrl}${sub.path}` }
    )
    if (!res.ok) errors.push(`${sub.topic}: ${res.error}`)
    else if (res.data.webhookSubscriptionCreate.userErrors.length > 0) {
      const msg = res.data.webhookSubscriptionCreate.userErrors[0].message
      // Doublon (webhook déjà enregistré) → non bloquant, on ignore.
      if (!/already|taken|exists/i.test(msg)) errors.push(`${sub.topic}: ${msg}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Récupère les commandes récentes d'un client par email ou téléphone.
 * Utilisé pour afficher le contexte Shopify à côté d'une conversation.
 */
export async function findOrdersByCustomer(
  shop: string,
  accessToken: string,
  opts: { email?: string | null; phone?: string | null }
) {
  // Construire la requête de recherche Shopify (email prioritaire, sinon téléphone)
  const clauses: string[] = []
  if (opts.email) clauses.push(`email:${opts.email}`)
  if (opts.phone) clauses.push(`phone:${opts.phone}`)
  if (clauses.length === 0) return { ok: true as const, data: [] }

  const q = clauses.join(' OR ')
  const res = await shopifyGraphQL<{
    orders: {
      edges: {
        node: {
          id: string
          name: string
          createdAt: string
          displayFinancialStatus: string | null
          displayFulfillmentStatus: string | null
          totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
          fulfillments: { trackingInfo: { number: string | null; url: string | null }[] }[]
        }
      }[]
    }
  }>(
    shop,
    accessToken,
    `query($q: String!) {
       orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) {
         edges { node {
           id name createdAt
           displayFinancialStatus displayFulfillmentStatus
           totalPriceSet { shopMoney { amount currencyCode } }
           fulfillments(first: 1) { trackingInfo { number url } }
         } }
       }
     }`,
    { q }
  )
  if (!res.ok) return res
  const orders = res.data.orders.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    createdAt: e.node.createdAt,
    financialStatus: e.node.displayFinancialStatus,
    fulfillmentStatus: e.node.displayFulfillmentStatus,
    total: e.node.totalPriceSet.shopMoney.amount,
    currency: e.node.totalPriceSet.shopMoney.currencyCode,
    tracking: e.node.fulfillments[0]?.trackingInfo[0] || null,
  }))
  return { ok: true as const, data: orders }
}

// ─── Actions write (exécutées UNIQUEMENT après validation humaine) ──

/** Retrouve l'ID GraphQL d'une commande à partir de son numéro (#1024 → gid). */
export async function findOrderIdByName(shop: string, accessToken: string, orderName: string) {
  const name = orderName.startsWith('#') ? orderName : `#${orderName}`
  const res = await shopifyGraphQL<{ orders: { edges: { node: { id: string; name: string } }[] } }>(
    shop,
    accessToken,
    `query($q: String!) { orders(first: 1, query: $q) { edges { node { id name } } } }`,
    { q: `name:${name}` }
  )
  if (!res.ok) return null
  return res.data.orders.edges[0]?.node.id ?? null
}

/** Annule une commande (orderCancel). */
export async function cancelOrder(shop: string, accessToken: string, orderId: string, reason = 'CUSTOMER') {
  return shopifyGraphQL<{ orderCancel: { userErrors: { message: string }[] } }>(
    shop,
    accessToken,
    `mutation($id: ID!, $reason: OrderCancelReason!) {
       orderCancel(orderId: $id, reason: $reason, refund: false, restock: true, notifyCustomer: true) {
         userErrors { message }
       }
     }`,
    { id: orderId, reason }
  )
}

/** Rembourse intégralement une commande. */
export async function refundOrder(shop: string, accessToken: string, orderId: string, note?: string) {
  return shopifyGraphQL<{ refundCreate: { userErrors: { message: string }[]; refund: { id: string } | null } }>(
    shop,
    accessToken,
    `mutation($input: RefundInput!) {
       refundCreate(input: $input) { userErrors { message } refund { id } }
     }`,
    { input: { orderId, note: note || 'Remboursement validé via Xeyo', notify: true } }
  )
}

/**
 * Crée un abonnement à l'app (AppSubscription) via la Billing API Shopify.
 * Retourne l'URL de confirmation vers laquelle rediriger le marchand.
 */
export async function createAppSubscription(
  shop: string,
  accessToken: string,
  opts: { name: string; price: number; currencyCode?: string; returnUrl: string; test?: boolean }
) {
  return shopifyGraphQL<{
    appSubscriptionCreate: {
      confirmationUrl: string | null
      appSubscription: { id: string } | null
      userErrors: { message: string }[]
    }
  }>(
    shop,
    accessToken,
    `mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
       appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
         confirmationUrl
         appSubscription { id }
         userErrors { message }
       }
     }`,
    {
      name: opts.name,
      returnUrl: opts.returnUrl,
      test: opts.test ?? false,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: opts.price, currencyCode: opts.currencyCode || 'EUR' },
              interval: 'EVERY_30_DAYS',
            },
          },
        },
      ],
    }
  )
}

/** Annule un abonnement app (downgrade vers free). */
export async function cancelAppSubscription(shop: string, accessToken: string, subscriptionId: string) {
  return shopifyGraphQL<{ appSubscriptionCancel: { userErrors: { message: string }[] } }>(
    shop,
    accessToken,
    `mutation($id: ID!) { appSubscriptionCancel(id: $id) { userErrors { message } } }`,
    { id: subscriptionId }
  )
}

/** Crée un code de réduction (montant ou pourcentage). */
export async function createDiscountCode(
  shop: string,
  accessToken: string,
  opts: { code: string; percentage?: number; amount?: number; currencyCode?: string }
) {
  const value = opts.percentage != null
    ? { percentage: opts.percentage / 100 }
    : { discountAmount: { amount: opts.amount ?? 0, appliesOnEachItem: false } }

  return shopifyGraphQL<{ discountCodeBasicCreate: { userErrors: { message: string }[]; codeDiscountNode: { id: string } | null } }>(
    shop,
    accessToken,
    `mutation($basic: DiscountCodeBasicInput!) {
       discountCodeBasicCreate(basicCodeDiscount: $basic) {
         userErrors { message }
         codeDiscountNode { id }
       }
     }`,
    {
      basic: {
        title: `Xeyo ${opts.code}`,
        code: opts.code,
        startsAt: new Date().toISOString(),
        customerSelection: { all: true },
        customerGets: {
          value,
          items: { all: true },
        },
        appliesOncePerCustomer: true,
      },
    }
  )
}
