import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit/middleware'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { shopifyGraphQL } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'
import { verifyAppProxySignature } from '@/lib/shopify/proxy-auth'

// L'extension checkout (origine extensions.shopifycdn.com) appelle cette route
// en cross-origin → headers CORS requis.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * App Proxy — récupère le téléphone d'une commande (côté serveur, Admin API).
 *
 * Appelé depuis la page Merci (Checkout UI Extension) :
 *   GET /apps/xeyo/order-phone?shop=...&order=<order_number>
 *
 * Le téléphone n'est pas exposé aux extensions côté client (protection Shopify),
 * donc on le récupère via l'Admin API avec le token de la boutique. C'est la
 * méthode utilisée par les apps WhatsApp concurrentes pour pré-remplir.
 */
/**
 * L'appel vient-il d'une page Shopify (boutique ou checkout) ?
 *
 * Substitut PARTIEL à la signature : `Origin` est posé par le navigateur et ne
 * peut pas être falsifié depuis une page web. Insuffisant seul pour de la PII —
 * on le combine donc à un identifiant de commande non devinable.
 */
function isShopifyOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') || ''
  if (!origin || origin === 'null') return false
  try {
    const u = new URL(origin)
    if (u.protocol !== 'https:') return false
    return u.hostname.endsWith('.myshopify.com')
      || u.hostname === 'shopify.com' || u.hostname.endsWith('.shopify.com')
      || u.hostname === 'checkout.shopify.com'
      // ⚠️ Les Checkout UI Extensions tournent dans un iframe SANDBOX servi par
      // le CDN d'extensions : leur `Origin` n'est pas la boutique. Sans ce
      // domaine, l'appel était refusé (401) et le numéro jamais pré-rempli.
      || u.hostname.endsWith('.shopifycdn.com')
      || u.hostname.endsWith('.shopifysvc.com')
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // SÉCURITÉ : cette route renvoie un téléphone client (PII). Deux portes.
  //
  // ⚠️ La signature seule ne pouvait PAS marcher : l'extension Merci appelle
  // app.xeyo.io en direct (le proxy {shop}/apps/xeyo renvoie un 302 sans CORS),
  // donc elle n'a aucune signature à fournir. Résultat : 401 systématique et
  // champ jamais pré-rempli.
  //
  // Porte 2 pour ce cas : origine Shopify vérifiée ET identifiant COMPLET de la
  // commande (gid). L'`order_number` séquentiel, lui, resterait énumérable —
  // on ne l'accepte donc que par signature.
  const signed = verifyAppProxySignature(searchParams)
  const fromShopify = isShopifyOrigin(req)
  const hasOpaqueId = (searchParams.get('id') || '').startsWith('gid://shopify/')

  // ⚠️ `Origin: null` — cas RÉEL de l'extension Merci.
  //
  // Les Checkout UI Extensions tournent dans un iframe sandbox : le navigateur
  // y envoie `Origin: null`, pas le domaine de la boutique. Mesuré :
  // myshopify.com et extensions.shopifycdn.com → 200, mais `null` → 401.
  // C'est ce qui empêchait À LA FOIS le pré-remplissage du numéro ET la
  // détection d'un opt-in déjà donné (le bloc se reproposait à chaque commande).
  //
  // On l'accepte donc, MAIS uniquement avec le `gid` complet — non devinable,
  // contrairement au numéro de commande séquentiel — et sous limite de débit,
  // pour qu'un identifiant fuité ne permette pas de balayage.
  const nullOrigin = (req.headers.get('origin') || '') === 'null'
  if (!signed && nullOrigin && hasOpaqueId) {
    const limited = checkRateLimit(req, 'AUTH')
    if (limited) {
      Object.entries(CORS).forEach(([k, v]) => limited.headers.set(k, v))
      return limited
    }
  }

  if (!signed && !((fromShopify || nullOrigin) && hasOpaqueId)) {
    // Trace de diagnostic : l'origine exacte envoyée par l'extension n'est pas
    // documentée (iframe sandbox du checkout). Sans elle, on ne peut que deviner.
    console.warn('[order-phone] refusé', {
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      hasId: hasOpaqueId,
      id: (searchParams.get('id') || '').slice(0, 40),
    })
    return NextResponse.json({ phone: null, error: 'signature invalide' }, { status: 401, headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  const shop = searchParams.get('shop')
  // Numéro de commande : uniquement chiffres/#/lettres (empêche l'injection de
  // filtre dans la recherche Shopify `query:`).
  const orderNumber = (searchParams.get('order') || '').trim().replace(/[^A-Za-z0-9#-]/g, '')
  const orderGid = (searchParams.get('id') || '').trim() // gid://shopify/OrderIdentity/123

  if (!shop || (!orderNumber && !orderGid)) {
    return NextResponse.json({ phone: null }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  // Extrait l'ID numérique du gid (…/OrderIdentity/5934953922637 → 5934953922637)
  const numericId = orderGid.match(/\/(\d+)$/)?.[1] || ''

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('shop_domain, access_token, user_id')
    .eq('shop_domain', shop)
    .maybeSingle()
  if (!store?.access_token) {
    return NextResponse.json({ phone: null }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ;
  // si null (reconnexion nécessaire), on renvoie phone:null comme les autres cas
  // « introuvable » (la page Merci se contente alors de ne pas pré-remplir).
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    console.error('[order-phone] jeton Shopify invalide pour', shop, '→ rouvrir l’app depuis l’admin Shopify')
    return NextResponse.json(
      { phone: null, error: 'jeton Shopify invalide' },
      { status: 502, headers: { ...CORS, 'Cache-Control': 'no-store' } }
    )
  }

  type OrderNode = {
    phone: string | null
    shippingAddress: { phone: string | null } | null
    billingAddress: { phone: string | null } | null
    customer: { phone: string | null; defaultPhoneNumber: { phoneNumber: string | null } | null } | null
  }
  const FIELDS = `phone shippingAddress { phone } billingAddress { phone } customer { phone defaultPhoneNumber { phoneNumber } }`

  let o: OrderNode | undefined
  const tried: string[] = []

  // 1) Par ID Order direct. ATTENTION : le gid reçu est souvent un
  // `OrderIdentity` (Customer Account API) dont l'ID numérique == l'ID Order.
  // On tente donc gid://shopify/Order/{numericId}.
  if (numericId) {
    const r = await shopifyGraphQL<{ order: OrderNode | null }>(
      store.shop_domain, token,
      `query($id: ID!) { order(id: $id) { ${FIELDS} } }`,
      { id: `gid://shopify/Order/${numericId}` }
    )
    tried.push(`order-by-id:${r.ok ? (r.data.order ? 'found' : 'null') : 'err'}`)
    if (r.ok && r.data.order) o = r.data.order
  }

  // 2) Fallback : recherche par numéro de confirmation.
  if (!o && orderNumber) {
    const r = await shopifyGraphQL<{ orders: { nodes: OrderNode[] } }>(
      store.shop_domain, token,
      `query($q: String!) { orders(first: 1, query: $q) { nodes { ${FIELDS} } } }`,
      { q: `confirmation_number:${orderNumber}` }
    )
    tried.push(`by-confirmation:${r.ok ? (r.data.orders.nodes[0] ? 'found' : 'null') : 'err'}`)
    if (r.ok) o = r.data.orders.nodes[0]
  }

  // 3) Fallback : par name (#1001) — utile si l'extension passe un order_number.
  if (!o && orderNumber) {
    const r = await shopifyGraphQL<{ orders: { nodes: OrderNode[] } }>(
      store.shop_domain, token,
      `query($q: String!) { orders(first: 1, query: $q) { nodes { ${FIELDS} } } }`,
      { q: `name:${orderNumber} OR name:#${orderNumber}` }
    )
    tried.push(`by-name:${r.ok ? (r.data.orders.nodes[0] ? 'found' : 'null') : 'err'}`)
    if (r.ok) o = r.data.orders.nodes[0]
  }

  // NB : PAS de fallback « dernière commande de la boutique » — il renvoyait le
  // téléphone d'un autre client si le numéro ne matchait pas (fuite PII).

  const phone = (
    o?.phone ||
    o?.shippingAddress?.phone ||
    o?.billingAddress?.phone ||
    o?.customer?.phone ||
    o?.customer?.defaultPhoneNumber?.phoneNumber ||
    null
  )

  // ── Ce numéro est-il DÉJÀ opted-in ? ──────────────────────────────────────
  // La page Merci s'en sert pour afficher « ✓ déjà abonné » au lieu de reproposer
  // l'opt-in (évite un doublon et une re-saisie inutile). On compare sur les 9
  // derniers chiffres (tolère les écarts de format : 0769… vs 33769… vs +33769…),
  // exactement comme la recherche de commandes.
  let alreadyOptedIn = false
  const wantDigits = (phone || '').replace(/\D/g, '')
  if (wantDigits.length >= 9 && store.user_id) {
    const tail = wantDigits.slice(-9)
    // Les contacts opted-in de CE marchand (via ses sessions WhatsApp).
    const { data: sessions } = await admin
      .from('whatsapp_sessions').select('id').eq('user_id', store.user_id)
    const sessionIds = (sessions || []).map((s) => s.id)
    if (sessionIds.length > 0) {
      const { data: contacts } = await admin
        .from('contacts')
        .select('phone_number')
        .in('session_id', sessionIds)
        .eq('opt_in_status', 'subscribed')
        // Pré-filtre serveur sur la fin du numéro (les 9 derniers chiffres) pour
        // ne pas tout ramener ; on confirme ensuite côté code.
        .ilike('phone_number', `%${tail}`)
      alreadyOptedIn = (contacts || []).some((c) => {
        const d = (c.phone_number || '').replace(/\D/g, '')
        return d.length >= 9 && (d.endsWith(tail) || tail.endsWith(d.slice(-9)))
      })
    }
  }

  // `tried` aide à diagnostiquer côté console quel chemin a résolu (ou non).
  return NextResponse.json({ phone, alreadyOptedIn, tried }, { headers: { ...CORS, 'Cache-Control': 'private, max-age=15' } })
}
