import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { shopifyGraphQL } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'

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

  if (!shop || !orderNumber) {
    return NextResponse.json({ phone: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

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
    return NextResponse.json({ phone: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const token = decryptMessage(store.access_token)

  // Recherche la commande par son name (ex: "#YWZAQ3HLD" ou "YWZAQ3HLD"),
  // et renvoie le téléphone (commande > livraison > facturation > client).
  const query = `
    query($q: String!) {
      orders(first: 1, query: $q) {
        nodes {
          phone
          shippingAddress { phone }
          billingAddress { phone }
          customer { phone defaultPhoneNumber { phoneNumber } }
        }
      }
    }`
  // On cherche par numéro de commande (avec et sans #)
  const q = `name:${orderNumber} OR name:#${orderNumber}`

  const res = await shopifyGraphQL<{ orders: { nodes: Array<{
    phone: string | null
    shippingAddress: { phone: string | null } | null
    billingAddress: { phone: string | null } | null
    customer: { phone: string | null; defaultPhoneNumber: { phoneNumber: string | null } | null } | null
  }> } }>(store.shop_domain, token, query, { q })

  if (!res.ok) {
    console.log('[order-phone DIAG] GraphQL error:', res.error?.slice(0, 300))
    return NextResponse.json({ phone: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  console.log('[order-phone DIAG] order=', orderNumber, 'nodes=', res.data.orders.nodes.length, 'data=', JSON.stringify(res.data.orders.nodes[0])?.slice(0, 300))
  const o = res.data.orders.nodes[0]
  const phone = (
    o?.phone ||
    o?.shippingAddress?.phone ||
    o?.billingAddress?.phone ||
    o?.customer?.phone ||
    o?.customer?.defaultPhoneNumber?.phoneNumber ||
    null
  )

  return NextResponse.json({ phone }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
