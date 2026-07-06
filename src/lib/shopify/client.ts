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
  // write_orders : refundCreate/orderCancel · read_fulfillments : webhook livraison (FULFILLMENT_EVENTS_CREATE)
  const scopes = process.env.SHOPIFY_SCOPES || 'read_products,read_content,read_orders,write_orders,read_customers,read_returns,read_legal_policies,read_fulfillments'
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

/**
 * Liste TOUTES les commandes de la boutique (REST, paginé via le header Link).
 * Sert au backfill de `shopify_orders` : Shopify ne rejoue pas les commandes
 * antérieures à l'abonnement webhook, donc on les récupère à la demande.
 *
 * Retourne les objets commande REST complets (mêmes champs que le webhook
 * orders/create), directement consommables par persistShopifyOrder.
 * `max` borne le nombre total récupéré (garde-fou anti-boucle).
 */
export async function listAllOrders(
  shop: string,
  accessToken: string,
  max = 2000
): Promise<{ ok: true; orders: Record<string, unknown>[] } | { ok: false; error: string }> {
  const orders: Record<string, unknown>[] = []
  // status=any inclut les commandes annulées/archivées ; 250 = max Shopify.
  let url: string | null =
    `https://${shop}/admin/api/${API_VERSION}/orders.json?status=any&limit=250`
  try {
    while (url && orders.length < max) {
      const res: Response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${text}` }
      }
      const json = await res.json()
      if (Array.isArray(json.orders)) orders.push(...json.orders)

      // Pagination cursor : header Link `<...page_info=...>; rel="next"`.
      const link = res.headers.get('link') || res.headers.get('Link') || ''
      const match = link.match(/<([^>]+)>;\s*rel="next"/)
      url = match ? match[1] : null
    }
    return { ok: true, orders: orders.slice(0, max) }
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
    // Livraison : fulfillment_events (statut du colis chez le transporteur) →
    // on filtre le statut 'delivered' pour émettre order_delivered.
    { topic: 'FULFILLMENT_EVENTS_CREATE', path: '/api/shopify/webhooks/fulfillment-events' },
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
  // Construire la requête de recherche Shopify (email prioritaire, sinon téléphone).
  // GARDE-FOU : on ignore une valeur dégénérée (email sans @, téléphone sans
  // assez de chiffres comme « + ») — sinon Shopify matcherait TOUTES les commandes.
  const clauses: string[] = []
  const email = (opts.email || '').trim()
  const phone = (opts.phone || '').trim()
  if (email.includes('@')) clauses.push(`email:${email}`)
  if (phone.replace(/\D/g, '').length >= 6) clauses.push(`phone:${phone}`)
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
          totalRefundedSet: { shopMoney: { amount: string } }
          fulfillments: { displayStatus: string | null; trackingInfo: { number: string | null; url: string | null }[] }[]
        }
      }[]
    }
  }>(
    shop,
    accessToken,
    // displayStatus = statut de livraison FIN du transporteur (IN_TRANSIT,
    // OUT_FOR_DELIVERY, DELIVERED…) — rempli seulement si le transporteur pousse
    // ses événements à Shopify (souvent absent en France → fallback tracking).
    // totalRefundedSet = montant déjà remboursé (source de vérité Shopify, que le
    // remboursement ait été fait via l'app OU directement dans l'admin Shopify).
    `query($q: String!) {
       orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) {
         edges { node {
           id name createdAt
           displayFinancialStatus displayFulfillmentStatus
           totalPriceSet { shopMoney { amount currencyCode } }
           totalRefundedSet { shopMoney { amount } }
           fulfillments(first: 1) { displayStatus trackingInfo { number url } }
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
    deliveryStatus: e.node.fulfillments[0]?.displayStatus || null,
    total: e.node.totalPriceSet.shopMoney.amount,
    totalRefunded: e.node.totalRefundedSet?.shopMoney?.amount || '0',
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

// ─── Remboursements ─────────────────────────────────────────────────
//
// Un refund Shopify DOIT inclure des `transactions` pour que l'argent bouge
// (sinon Shopify enregistre un remboursement à 0€). On passe donc toujours par
// `order.suggestedRefund` qui calcule le montant ET fournit les
// `suggestedTransactions` prêtes à injecter dans `refundCreate`.

export type RefundLineItem = { lineItemId: string; quantity: number }

export type RefundableOrder = {
  id: string
  name: string
  currency: string
  total: number
  totalRefunded: number
  refundableAmount: number // total - déjà remboursé
  lineItems: { id: string; title: string; quantity: number; unitPrice: number }[]
}

/** Détails d'une commande utiles au remboursement (montants + articles). */
export async function getRefundableOrder(
  shop: string,
  accessToken: string,
  orderId: string
): Promise<RefundableOrder | null> {
  const res = await shopifyGraphQL<{
    order: {
      id: string
      name: string
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
      totalRefundedSet: { shopMoney: { amount: string } }
      lineItems: { nodes: { id: string; title: string; quantity: number; discountedUnitPriceSet: { shopMoney: { amount: string } } }[] }
    } | null
  }>(
    shop,
    accessToken,
    `query($id: ID!) {
       order(id: $id) {
         id name
         totalPriceSet { shopMoney { amount currencyCode } }
         totalRefundedSet { shopMoney { amount } }
         lineItems(first: 50) {
           nodes { id title quantity discountedUnitPriceSet { shopMoney { amount } } }
         }
       }
     }`,
    { id: orderId }
  )
  if (!res.ok || !res.data.order) return null
  const o = res.data.order
  const total = Number(o.totalPriceSet.shopMoney.amount) || 0
  const totalRefunded = Number(o.totalRefundedSet?.shopMoney?.amount) || 0
  return {
    id: o.id,
    name: o.name,
    currency: o.totalPriceSet.shopMoney.currencyCode,
    total,
    totalRefunded,
    refundableAmount: Math.max(0, total - totalRefunded),
    lineItems: o.lineItems.nodes.map((li) => ({
      id: li.id,
      title: li.title,
      quantity: li.quantity,
      unitPrice: Number(li.discountedUnitPriceSet?.shopMoney?.amount) || 0,
    })),
  }
}

type SuggestedTransaction = { amount: string; gateway: string; parentTransaction: { id: string } }

/**
 * Suggestion de remboursement Shopify : renvoie le montant calculé et les
 * transactions à rejouer. Sans refundLineItems → suggestion de refund TOTAL.
 */
export async function getSuggestedRefund(
  shop: string,
  accessToken: string,
  orderId: string,
  opts?: { refundLineItems?: RefundLineItem[]; refundShipping?: boolean }
): Promise<{ amount: number; currency: string; transactions: SuggestedTransaction[]; refundLineItems: RefundLineItem[] } | null> {
  const res = await shopifyGraphQL<{
    order: {
      suggestedRefund: {
        amountSet: { shopMoney: { amount: string; currencyCode: string } }
        refundLineItems: { nodes: { lineItem: { id: string }; quantity: number }[] }
        suggestedTransactions: SuggestedTransaction[]
      } | null
    } | null
  }>(
    shop,
    accessToken,
    `query($id: ID!, $refundLineItems: [RefundLineItemInput!], $refundShipping: ShippingRefundInput) {
       order(id: $id) {
         suggestedRefund(refundLineItems: $refundLineItems, refundShipping: $refundShipping) {
           amountSet { shopMoney { amount currencyCode } }
           refundLineItems { nodes { lineItem { id } quantity } }
           suggestedTransactions { amount gateway parentTransaction { id } }
         }
       }
     }`,
    {
      id: orderId,
      refundLineItems: opts?.refundLineItems?.map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity })) ?? null,
      refundShipping: opts?.refundShipping ? { fullRefund: true } : null,
    }
  )
  if (!res.ok || !res.data.order?.suggestedRefund) return null
  const sr = res.data.order.suggestedRefund
  return {
    amount: Number(sr.amountSet.shopMoney.amount) || 0,
    currency: sr.amountSet.shopMoney.currencyCode,
    transactions: sr.suggestedTransactions || [],
    refundLineItems: sr.refundLineItems.nodes.map((n) => ({ lineItemId: n.lineItem.id, quantity: n.quantity })),
  }
}

/**
 * Rembourse une commande (partiel ou total) — VRAI mouvement d'argent.
 * - opts.refundLineItems : articles précis (partiel par article)
 * - opts.amount : plafonne le montant remboursé (partiel par montant)
 * - opts.note : raison (visible dans Shopify)
 * Passe par getSuggestedRefund pour obtenir les transactions requises.
 */
/** Méthode de remboursement choisie par le marchand. */
export type RefundMethod = 'original' | 'store_credit' | 'both'

export async function refundOrder(
  shop: string,
  accessToken: string,
  orderId: string,
  opts?: {
    note?: string
    refundLineItems?: RefundLineItem[]
    refundShipping?: boolean
    amount?: number
    // Méthode : 'original' (moyen de paiement d'origine, défaut), 'store_credit'
    // (avoir), ou 'both' (part en avoir + reste sur le moyen d'origine).
    method?: RefundMethod
    // Pour 'both' : montant à mettre en avoir (le reste part sur l'original).
    storeCreditAmount?: number
  }
): Promise<{ ok: true; data: { refundId: string | null; amount: number; currency: string; method: RefundMethod } } | { ok: false; error: string }> {
  // Remboursement TOTAL (aucun article précisé) : Shopify renvoie un montant
  // suggéré de 0 si on ne lui passe PAS les articles (cas confirmé sur une
  // commande expédiée). On résout donc tous les line items non encore remboursés
  // et on les passe à suggestedRefund, sinon le remboursement total échouerait.
  let refundLineItems = opts?.refundLineItems
  if (!refundLineItems || refundLineItems.length === 0) {
    const refundable = await getRefundableOrder(shop, accessToken, orderId)
    console.log(`[refundOrder] getRefundableOrder → ${refundable ? `${refundable.lineItems.length} articles, remboursable ${refundable.refundableAmount}` : 'NULL'}`)
    if (refundable && refundable.lineItems.length > 0) {
      refundLineItems = refundable.lineItems.map((li) => ({ lineItemId: li.id, quantity: li.quantity }))
    }
  }

  const suggested = await getSuggestedRefund(shop, accessToken, orderId, {
    refundLineItems,
    refundShipping: opts?.refundShipping,
  })
  console.log(`[refundOrder] getSuggestedRefund(articles=${refundLineItems?.length ?? 0}) → ${suggested ? `amount ${suggested.amount}, ${suggested.transactions.length} tx` : 'NULL'}`)
  if (!suggested) return { ok: false, error: 'Impossible de calculer le remboursement (commande introuvable ou non remboursable)' }
  if (suggested.transactions.length === 0) return { ok: false, error: 'Aucune transaction remboursable sur cette commande' }
  if (suggested.amount <= 0) return { ok: false, error: 'Cette commande n’a rien à rembourser (déjà remboursée ou montant nul).' }

  const method: RefundMethod = opts?.method || 'original'
  const currency = suggested.currency

  // Montant total effectivement remboursé (plafonné au suggéré).
  const isPartialByAmount = opts?.amount != null && opts.amount > 0 && opts.amount < suggested.amount
  const effectiveAmount = isPartialByAmount ? opts!.amount! : suggested.amount

  // Répartition entre avoir (store credit) et moyen d'origine (transactions).
  let storeCreditPart = 0
  let originalPart = effectiveAmount
  if (method === 'store_credit') {
    storeCreditPart = effectiveAmount
    originalPart = 0
  } else if (method === 'both') {
    // La part avoir ne peut pas dépasser le total remboursé.
    storeCreditPart = Math.min(Math.max(0, opts?.storeCreditAmount ?? 0), effectiveAmount)
    originalPart = Math.round((effectiveAmount - storeCreditPart) * 100) / 100
  }

  // Transactions (part sur le moyen d'origine). Vide si tout en avoir.
  let transactions: { orderId: string; gateway: string; kind: string; parentId: string; amount: string }[] = []
  if (originalPart > 0) {
    transactions = suggested.transactions.map((t) => ({
      orderId, gateway: t.gateway, kind: 'REFUND', parentId: t.parentTransaction.id, amount: t.amount,
    }))
    // Si on ne rembourse qu'une partie sur l'original, plafonner la 1re transaction.
    if (originalPart < suggested.amount) {
      transactions = [{ ...transactions[0], amount: originalPart.toFixed(2) }]
    }
  }

  // refundMethods : la part en avoir (store credit). Nécessite que la boutique
  // ait le store credit activé (sinon Shopify renvoie une userError explicite).
  const refundMethods = storeCreditPart > 0
    ? [{ storeCreditRefund: { amount: { amount: storeCreditPart.toFixed(2), currencyCode: currency } } }]
    : undefined

  // Un remboursement par montant pur (ou tout en avoir) ne rattache pas d'article.
  const attachLineItems = !isPartialByAmount && method !== 'store_credit'

  const res = await shopifyGraphQL<{ refundCreate: { userErrors: { message: string }[]; refund: { id: string } | null } }>(
    shop,
    accessToken,
    `mutation($input: RefundInput!) {
       refundCreate(input: $input) { userErrors { message } refund { id } }
     }`,
    {
      input: {
        orderId,
        note: opts?.note || 'Remboursement validé via Xeyo',
        notify: true,
        refundLineItems: attachLineItems
          ? refundLineItems?.map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity, restockType: 'NO_RESTOCK' }))
          : undefined,
        transactions: transactions.length > 0 ? transactions : undefined,
        refundMethods,
      },
    }
  )
  if (!res.ok) return { ok: false, error: res.error }
  const errs = res.data.refundCreate.userErrors
  if (errs && errs.length > 0) return { ok: false, error: errs.map((e) => e.message).join(', ') }
  return { ok: true, data: { refundId: res.data.refundCreate.refund?.id ?? null, amount: effectiveAmount, currency, method } }
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
