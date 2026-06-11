import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { shopifyGraphQL } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'

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
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shop = searchParams.get('shop')
  const orderNumber = (searchParams.get('order') || '').trim()
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
    .select('shop_domain, access_token')
    .eq('shop_domain', shop)
    .maybeSingle()
  if (!store?.access_token) {
    return NextResponse.json({ phone: null }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  const token = decryptMessage(store.access_token)

  type OrderNode = {
    phone: string | null
    shippingAddress: { phone: string | null } | null
    billingAddress: { phone: string | null } | null
    customer: { phone: string | null; defaultPhoneNumber: { phoneNumber: string | null } | null } | null
  }
  const FIELDS = `phone shippingAddress { phone } billingAddress { phone } customer { phone defaultPhoneNumber { phoneNumber } }`

  let o: OrderNode | undefined

  // 1) Le plus fiable : par ID direct (depuis orderConfirmation.order.id)
  if (numericId) {
    const r = await shopifyGraphQL<{ order: OrderNode | null }>(
      store.shop_domain, token,
      `query($id: ID!) { order(id: $id) { ${FIELDS} } }`,
      { id: `gid://shopify/Order/${numericId}` }
    )
    if (r.ok && r.data.order) o = r.data.order
  }

  // 2) Fallback : recherche par numéro de confirmation ou name
  if (!o && orderNumber) {
    const r = await shopifyGraphQL<{ orders: { nodes: OrderNode[] } }>(
      store.shop_domain, token,
      `query($q: String!) { orders(first: 1, query: $q) { nodes { ${FIELDS} } } }`,
      { q: `confirmation_number:${orderNumber} OR name:${orderNumber} OR name:#${orderNumber}` }
    )
    if (r.ok) o = r.data.orders.nodes[0]
  }
  const phone = (
    o?.phone ||
    o?.shippingAddress?.phone ||
    o?.billingAddress?.phone ||
    o?.customer?.phone ||
    o?.customer?.defaultPhoneNumber?.phoneNumber ||
    null
  )

  return NextResponse.json({ phone }, { headers: { ...CORS, 'Cache-Control': 'private, max-age=30' } })
}
