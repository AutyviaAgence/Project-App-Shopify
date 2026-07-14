import 'server-only'
import crypto from 'crypto'

/**
 * Client Shopify (Admin API + OAuth) — server-only.
 * Gère le flux d'installation OAuth, la vérification HMAC, l'échange du
 * code contre un access_token, et les appels Admin API (catalogue, etc.).
 */

/**
 * Version de l'Admin API pour les appels SORTANTS (GraphQL).
 * À garder alignée sur `api_version` dans shopify.app.xeyo-app-store.toml, qui
 * régit lui le format des webhooks ENTRANTS — ce sont deux réglages distincts,
 * et un écart entre les deux dérive en silence.
 */
const API_VERSION = '2026-07'

/**
 * Échappe une valeur utilisateur avant de l'injecter dans une recherche Shopify
 * (`query:`). On l'entoure de guillemets et on neutralise les caractères qui
 * pourraient altérer la sémantique du filtre (guillemets, `:`, parenthèses,
 * opérateurs OR/AND). Empêche l'injection de filtre (ex : `x OR status:any`).
 */
function shopifySearchValue(v: string): string {
  const cleaned = String(v).replace(/["():]/g, ' ').replace(/\s+/g, ' ').trim()
  return `"${cleaned}"`
}

/**
 * Scopes demandés à l'OAuth. ⚠️ DOIT rester STRICTEMENT aligné sur
 * `shopify.app.xeyo-app-store.toml` ([access_scopes].scopes) : si le code demande
 * moins que le toml, les appels correspondants échouent en 403 en prod (c'était le
 * cas de write_discounts → création de codes promo cassée).
 *
 * Détail : write_orders (refundCreate/orderCancel) · write_discounts
 * (discountCodeBasicCreate) · read_fulfillments (webhook livraison) ·
 * read_all_orders (scope PRIVILÉGIÉ, approuvé par Shopify : sans lui, l'Admin API
 * plafonne aux 60 derniers jours et tronque SILENCIEUSEMENT au-delà).
 */
const DEFAULT_SCOPES = [
  'read_all_orders',
  'read_customers',
  'write_discounts',
  'read_orders',
  'write_orders',
  'read_products',
  'read_content',
  'read_legal_policies',
  'read_returns',
  'read_fulfillments',
].join(',')

export function getShopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET
  const scopes = process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES
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

/**
 * TOKEN EXCHANGE — échange un session token contre un access token Admin API.
 *
 * ⚠️ Indispensable avec le **managed install** (`use_legacy_install_flow = false`).
 * Dans ce mode, Shopify installe l'app SANS JAMAIS appeler notre callback OAuth :
 * il ouvre directement l'app embedded avec un session token. Le callback
 * `/api/shopify/callback` — et donc la création de la ligne `shopify_stores` —
 * n'est jamais déclenché. Sans token exchange, la boutique n'existe nulle part et
 * l'app affiche « Installation requise » indéfiniment.
 *
 * Doc : https://shopify.dev/docs/apps/auth/get-access-tokens/token-exchange
 */
export async function exchangeSessionToken(
  shop: string,
  sessionToken: string
): Promise<{ ok: true; accessToken: string; scope: string } | { ok: false; error: string }> {
  const { apiKey, apiSecret } = getShopifyConfig()
  if (!apiKey || !apiSecret) return { ok: false, error: 'Config Shopify manquante' }

  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: sessionToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        // `offline` : jeton permanent, utilisable par les crons et les webhooks
        // quand le marchand n'est pas devant son écran (c'est notre cas : envois
        // programmés, relances de panier). Un jeton `online` expirerait avec la
        // session du marchand et casserait toutes les automatisations.
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text}` }
    }
    const data = await res.json()
    return { ok: true, accessToken: data.access_token, scope: data.scope || '' }
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
/**
 * Champs de commande demandés en GraphQL. Doit couvrir tout ce que consomment
 * `persistShopifyOrder` et `buildOrderContext` (type ShopifyOrder, snake_case).
 */
const ORDER_GQL_FIELDS = `
  id
  name
  createdAt
  cancelledAt
  currencyCode
  customerLocale
  displayFinancialStatus
  displayFulfillmentStatus
  statusPageUrl
  phone
  email
  totalPriceSet { shopMoney { amount currencyCode } }
  customAttributes { key value }
  customer {
    id firstName lastName email phone locale numberOfOrders
    defaultAddress { phone countryCodeV2 }
  }
  shippingAddress { phone countryCodeV2 }
  billingAddress { phone countryCodeV2 }
  lineItems(first: 100) { nodes { title quantity product { id } } }
  fulfillments(first: 10) { trackingInfo { number url } }
`

/** Convertit une commande GraphQL vers le format REST (snake_case) attendu en aval. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gqlOrderToRest(o: any): Record<string, unknown> {
  const numericId = String(o?.id || '').split('/').pop() || ''
  const total = o?.totalPriceSet?.shopMoney?.amount ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addr = (a: any) => (a ? { phone: a.phone ?? null, country_code: a.countryCodeV2 ?? null } : null)
  return {
    id: numericId ? Number(numericId) : undefined,
    name: o?.name ?? null,
    order_number: o?.name ? Number(String(o.name).replace(/\D/g, '')) : undefined,
    created_at: o?.createdAt ?? null,
    cancelled_at: o?.cancelledAt ?? null,
    currency: o?.currencyCode ?? null,
    customer_locale: o?.customerLocale ?? null,
    financial_status: o?.displayFinancialStatus ? String(o.displayFinancialStatus).toLowerCase() : null,
    fulfillment_status: o?.displayFulfillmentStatus ? String(o.displayFulfillmentStatus).toLowerCase() : null,
    order_status_url: o?.statusPageUrl ?? null,
    total_price: total != null ? String(total) : null,
    phone: o?.phone ?? null,
    email: o?.email ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    note_attributes: (o?.customAttributes || []).map((a: any) => ({ name: a.key, value: a.value })),
    customer: o?.customer
      ? {
          phone: o.customer.phone ?? null,
          email: o.customer.email ?? null,
          first_name: o.customer.firstName ?? null,
          last_name: o.customer.lastName ?? null,
          locale: o.customer.locale ?? null,
          orders_count: o.customer.numberOfOrders != null ? Number(o.customer.numberOfOrders) : undefined,
          default_address: addr(o.customer.defaultAddress),
        }
      : undefined,
    shipping_address: addr(o?.shippingAddress),
    billing_address: addr(o?.billingAddress),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line_items: (o?.lineItems?.nodes || []).map((li: any) => ({
      title: li?.title ?? null,
      name: li?.title ?? null,
      product_id: li?.product?.id ? String(li.product.id).split('/').pop() : null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fulfillments: (o?.fulfillments || []).map((f: any) => ({
      tracking_number: f?.trackingInfo?.[0]?.number ?? null,
      tracking_url: f?.trackingInfo?.[0]?.url ?? null,
    })),
  }
}

export async function fetchOrderById(
  shop: string,
  accessToken: string,
  orderId: string | number
): Promise<{ ok: true; order: Record<string, unknown> } | { ok: false; error: string }> {
  // GraphQL uniquement : Shopify EXIGE l'Admin API GraphQL pour les nouvelles apps
  // (App Store requirement 2.2.4, avril 2025) — l'API REST vaut un rejet.
  const gid = String(orderId).startsWith('gid://') ? String(orderId) : `gid://shopify/Order/${orderId}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await shopifyGraphQL<{ order: any }>(
    shop,
    accessToken,
    `query($id: ID!) { order(id: $id) { ${ORDER_GQL_FIELDS} } }`,
    { id: gid }
  )
  if (!res.ok) return { ok: false, error: res.error }
  if (!res.data?.order) return { ok: false, error: 'order absent de la réponse' }
  return { ok: true, order: gqlOrderToRest(res.data.order) }
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
/**
 * Historique COMPLET des commandes (pas de borne temporelle).
 *
 * ⚠️ Exige le scope `read_all_orders` — un scope privilégié, approuvé par Shopify
 * le 13 juillet 2026. Avec `read_orders` seul, l'Admin API plafonne aux 60 derniers
 * jours et **tronque silencieusement** au-delà : on croirait avoir tout l'historique
 * alors qu'il en manquerait la moitié.
 *
 * Si ce scope venait à être révoqué, il faudrait RÉTABLIR une borne explicite
 * (`query: "created_at:>=..."`) plutôt que de laisser l'API mentir.
 */
export async function listAllOrders(
  shop: string,
  accessToken: string,
  max = 2000
): Promise<{ ok: true; orders: Record<string, unknown>[] } | { ok: false; error: string }> {
  // GraphQL + pagination par curseur (requirement 2.2.4 : REST interdit).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type OrdersPage = { orders: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }
  const orders: Record<string, unknown>[] = []
  let cursor: string | null = null
  let guard = 0

  while (orders.length < max && guard++ < 50) {
    const take = Math.min(100, max - orders.length) // 100 = plafond GraphQL / page
    const res: { ok: true; data: OrdersPage } | { ok: false; error: string } =
      await shopifyGraphQL<OrdersPage>(
        shop,
        accessToken,
        `query($n: Int!, $after: String) {
           orders(first: $n, after: $after, sortKey: CREATED_AT, reverse: true, query: "status:any") {
             nodes { ${ORDER_GQL_FIELDS} }
             pageInfo { hasNextPage endCursor }
           }
         }`,
        { n: take, after: cursor }
      )
    if (!res.ok) return { ok: false, error: res.error }
    const page: OrdersPage['orders'] | undefined = res.data?.orders
    if (!page) break
    orders.push(...(page.nodes || []).map(gqlOrderToRest))
    if (!page.pageInfo?.hasNextPage) break
    cursor = page.pageInfo.endCursor
    if (!cursor) break
  }
  return { ok: true, orders: orders.slice(0, max) }
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
    // Désinstallation : marque la boutique inactive (sinon elle reste
    // « Connectée » pour toujours avec un token révoqué).
    { topic: 'APP_UNINSTALLED', path: '/api/shopify/webhooks/app-uninstalled' },
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
  if (email.includes('@')) clauses.push(`email:${shopifySearchValue(email)}`)
  if (phone.replace(/\D/g, '').length >= 6) clauses.push(`phone:${shopifySearchValue(phone)}`)
  if (clauses.length === 0) return { ok: true as const, data: [] }

  const q = clauses.join(' OR ')
  const res = await shopifyGraphQL<{
    orders: {
      edges: {
        node: {
          id: string
          name: string
          createdAt: string
          email: string | null
          phone: string | null
          customer: { email: string | null; phone: string | null } | null
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
    // On récupère email/phone de la commande ET du client pour FILTRER côté code :
    // la recherche `phone:` de Shopify peut, quand aucune commande ne matche,
    // retomber sur « toutes les commandes récentes » → on ne garde que celles qui
    // correspondent VRAIMENT au contact.
    `query($q: String!) {
       orders(first: 20, query: $q, sortKey: CREATED_AT, reverse: true) {
         edges { node {
           id name createdAt
           email phone
           customer { email phone }
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

  // FILTRE de sécurité : ne garder que les commandes correspondant réellement à
  // l'email ou au téléphone du contact (défait le piège « phone: → tout »).
  const wantEmail = email.includes('@') ? email.toLowerCase() : null
  const wantDigits = phone.replace(/\D/g, '')
  const wantPhone = wantDigits.length >= 6 ? wantDigits : null
  const matches = (n: { email: string | null; phone: string | null; customer: { email: string | null; phone: string | null } | null }): boolean => {
    const emails = [n.email, n.customer?.email].filter(Boolean).map((e) => e!.toLowerCase())
    const phones = [n.phone, n.customer?.phone].filter(Boolean).map((p) => p!.replace(/\D/g, ''))
    if (wantEmail && emails.includes(wantEmail)) return true
    // Téléphone : comparaison sur les 9 derniers chiffres (tolère indicatif/0).
    if (wantPhone && phones.some((p) => p.endsWith(wantPhone.slice(-9)) || wantPhone.endsWith(p.slice(-9)))) return true
    return false
  }

  const orders = res.data.orders.edges
    .filter((e) => matches(e.node))
    .slice(0, 5)
    .map((e) => ({
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

// ─── Liaison contact ↔ client Shopify (customer_id) ────────────────

type OrderNode = {
  id: string
  name: string
  createdAt: string
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  totalRefundedSet: { shopMoney: { amount: string } } | null
  fulfillments: { displayStatus: string | null; trackingInfo: { number: string | null; url: string | null }[] }[]
}

const ORDER_FIELDS = `
  id name createdAt
  displayFinancialStatus displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  totalRefundedSet { shopMoney { amount } }
  fulfillments(first: 1) { displayStatus trackingInfo { number url } }
`

function mapOrder(n: OrderNode) {
  return {
    id: n.id,
    name: n.name,
    createdAt: n.createdAt,
    financialStatus: n.displayFinancialStatus,
    fulfillmentStatus: n.displayFulfillmentStatus,
    deliveryStatus: n.fulfillments[0]?.displayStatus || null,
    total: n.totalPriceSet.shopMoney.amount,
    totalRefunded: n.totalRefundedSet?.shopMoney?.amount || '0',
    currency: n.totalPriceSet.shopMoney.currencyCode,
    tracking: n.fulfillments[0]?.trackingInfo[0] || null,
  }
}

/** Trouve un client Shopify par email. Renvoie son gid + email/phone/nom, ou null. */
export async function findCustomerByEmail(
  shop: string,
  accessToken: string,
  email: string
): Promise<{ id: string; email: string | null; phone: string | null; displayName: string | null } | null> {
  const clean = email.trim().toLowerCase()
  if (!clean.includes('@')) return null
  const res = await shopifyGraphQL<{
    customers: { edges: { node: { id: string; email: string | null; phone: string | null; displayName: string | null } }[] }
  }>(
    shop,
    accessToken,
    `query($q: String!) { customers(first: 1, query: $q) { edges { node { id email phone displayName } } } }`,
    { q: `email:${shopifySearchValue(clean)}` }
  )
  if (!res.ok) return null
  return res.data.customers.edges[0]?.node ?? null
}

/** Trouve un client Shopify par téléphone (numéro E.164 sans espaces). */
export async function findCustomerByPhone(
  shop: string,
  accessToken: string,
  phone: string
): Promise<{ id: string; email: string | null; phone: string | null; displayName: string | null } | null> {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return null
  const res = await shopifyGraphQL<{
    customers: { edges: { node: { id: string; email: string | null; phone: string | null; displayName: string | null } }[] }
  }>(
    shop,
    accessToken,
    `query($q: String!) { customers(first: 5, query: $q) { edges { node { id email phone displayName } } } }`,
    { q: `phone:${shopifySearchValue('+' + digits)}` }
  )
  if (!res.ok) return null
  // Sécurité : ne garder qu'un client dont le téléphone matche vraiment (9 derniers chiffres).
  const node = res.data.customers.edges
    .map((e) => e.node)
    .find((n) => (n.phone || '').replace(/\D/g, '').endsWith(digits.slice(-9)))
  return node ?? null
}

/** Commandes d'un client par son gid Shopify — FIABLE (pas de faux positifs). */
export async function findOrdersByCustomerId(
  shop: string,
  accessToken: string,
  customerId: string,
  limit = 5
) {
  const res = await shopifyGraphQL<{ customer: { orders: { edges: { node: OrderNode }[] } } | null }>(
    shop,
    accessToken,
    `query($id: ID!, $n: Int!) {
       customer(id: $id) {
         orders(first: $n, sortKey: CREATED_AT, reverse: true) {
           edges { node { ${ORDER_FIELDS} } }
         }
       }
     }`,
    { id: customerId, n: limit }
  )
  if (!res.ok) return res
  const nodes = res.data.customer?.orders.edges.map((e) => e.node) ?? []
  return { ok: true as const, data: nodes.map(mapOrder) }
}

// ─── Actions write (exécutées UNIQUEMENT après validation humaine) ──

/** Retrouve l'ID GraphQL d'une commande à partir de son numéro (#1024 → gid). */
export async function findOrderIdByName(shop: string, accessToken: string, orderName: string) {
  const name = orderName.startsWith('#') ? orderName : `#${orderName}`
  const res = await shopifyGraphQL<{ orders: { edges: { node: { id: string; name: string } }[] } }>(
    shop,
    accessToken,
    `query($q: String!) { orders(first: 1, query: $q) { edges { node { id name } } } }`,
    { q: `name:${shopifySearchValue(name)}` }
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
        refundLineItems: { lineItem: { id: string }; quantity: number }[]
        suggestedTransactions: SuggestedTransaction[]
      } | null
    } | null
  }>(
    shop,
    accessToken,
    // NB : `refundShipping` est un Boolean (pas ShippingRefundInput), et
    // `refundLineItems` est une LISTE directe (pas une connexion `nodes`).
    // Se tromper là-dessus fait échouer TOUTE la requête → suggestedRefund null.
    `query($id: ID!, $refundLineItems: [RefundLineItemInput!], $refundShipping: Boolean) {
       order(id: $id) {
         suggestedRefund(refundLineItems: $refundLineItems, refundShipping: $refundShipping) {
           amountSet { shopMoney { amount currencyCode } }
           refundLineItems { lineItem { id } quantity }
           suggestedTransactions { amount gateway parentTransaction { id } }
         }
       }
     }`,
    {
      id: orderId,
      refundLineItems: opts?.refundLineItems?.map((li) => ({ lineItemId: li.lineItemId, quantity: li.quantity })) ?? null,
      refundShipping: opts?.refundShipping ?? true,
    }
  )
  if (!res.ok) {
    console.error(`[getSuggestedRefund] erreur GraphQL: ${res.error}`)
    return null
  }
  if (!res.data.order?.suggestedRefund) {
    console.error(`[getSuggestedRefund] suggestedRefund null (order=${res.data.order ? 'présent' : 'null'})`)
    return null
  }
  const sr = res.data.order.suggestedRefund
  return {
    amount: Number(sr.amountSet.shopMoney.amount) || 0,
    currency: sr.amountSet.shopMoney.currencyCode,
    transactions: sr.suggestedTransactions || [],
    refundLineItems: (sr.refundLineItems || []).map((n) => ({ lineItemId: n.lineItem.id, quantity: n.quantity })),
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

  // ⚠️ Exigence App Store 1.1.15 : « Your app must not offer methods for processing
  // refunds outside of the original payment processor. » Un remboursement 100 % en
  // avoir (store credit) ne rend rien à l'acheteur sur son moyen de paiement : c'est
  // exactement ce que la règle proscrit, et c'est un motif de rejet.
  //
  // On force donc le remboursement sur le moyen d'origine. `store_credit` et `both`
  // restent dans le type (des appels historiques peuvent les passer) mais sont
  // neutralisés ici — le garde est côté SERVEUR, pas seulement dans l'UI, car c'est
  // le seul endroit qui compte.
  const requested: RefundMethod = opts?.method || 'original'
  if (requested !== 'original') {
    console.warn(`[refundOrder] méthode « ${requested} » ignorée → remboursement sur le moyen d'origine (App Store 1.1.15)`)
  }
  const method: RefundMethod = 'original'
  const currency = suggested.currency

  // Montant total effectivement remboursé (plafonné au suggéré).
  const isPartialByAmount = opts?.amount != null && opts.amount > 0 && opts.amount < suggested.amount
  const effectiveAmount = isPartialByAmount ? opts!.amount! : suggested.amount

  // Tout part sur le moyen de paiement d'origine (cf. garde 1.1.15 ci-dessus).
  const originalPart = effectiveAmount

  let transactions = suggested.transactions.map((t) => ({
    orderId, gateway: t.gateway, kind: 'REFUND', parentId: t.parentTransaction.id, amount: t.amount,
  }))
  // Remboursement partiel : on plafonne la 1re transaction au montant demandé.
  if (originalPart < suggested.amount) {
    transactions = [{ ...transactions[0], amount: originalPart.toFixed(2) }]
  }

  // Plus de `refundMethods` : on ne rembourse qu'en `transactions`, sur le moyen
  // d'origine (App Store 1.1.15). `storeCreditRefund` est délibérément abandonné.

  // Un remboursement par montant pur ne rattache pas d'article.
  const attachLineItems = !isPartialByAmount

  // Depuis l'API 2026-04, refundCreate EXIGE la directive @idempotent(key: ...)
  // (clé unique) pour éviter les doubles remboursements. On génère une UUID.
  const idempotencyKey = crypto.randomUUID()
  const res = await shopifyGraphQL<{ refundCreate: { userErrors: { message: string }[]; refund: { id: string } | null } }>(
    shop,
    accessToken,
    `mutation($input: RefundInput!) {
       refundCreate(input: $input) @idempotent(key: "${idempotencyKey}") { userErrors { message } refund { id } }
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

/**
 * Statut d'un abonnement app par son gid. Sert à VÉRIFIER auprès de Shopify
 * qu'un paiement est bien ACTIVE avant d'activer le plan côté Xeyo (sinon un
 * appelant pourrait forger le callback billing et activer un plan sans payer).
 */
export async function getAppSubscriptionStatus(
  shop: string,
  accessToken: string,
  subscriptionId: string
): Promise<{ status: string; name: string } | null> {
  const res = await shopifyGraphQL<{ node: { status: string; name: string } | null }>(
    shop,
    accessToken,
    `query($id: ID!) { node(id: $id) { ... on AppSubscription { status name } } }`,
    { id: subscriptionId }
  )
  if (!res.ok || !res.data.node) return null
  return res.data.node
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
