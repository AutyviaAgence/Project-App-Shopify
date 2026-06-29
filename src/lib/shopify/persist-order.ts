import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import type { ShopifyOrder } from '@/lib/automations/shopify-context'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Persiste (upsert) une commande Shopify reçue par webhook dans `shopify_orders`,
 * pour pouvoir agréger le CA mensuel. Marque la commande comme « WhatsApp » si le
 * contact relié est opt-in (opt_in_status = 'subscribed').
 *
 * Best-effort : ne jette jamais (les stats ne doivent pas casser le webhook).
 */
export async function persistShopifyOrder(
  userId: string,
  shopDomain: string,
  order: ShopifyOrder
): Promise<void> {
  try {
    const supabase = admin()

    const shopifyOrderId = order.id != null ? String(order.id) : ''
    if (!shopifyOrderId) return

    // Boutique → store_id
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .maybeSingle()
    const storeId = store?.id ?? null

    // Retrouver le contact (par téléphone, sinon email) + son opt-in.
    const rawPhone =
      order.customer?.phone
      || order.phone
      || order.shipping_address?.phone
      || order.billing_address?.phone
      || order.customer?.default_address?.phone
      || null
    const phone = rawPhone ? rawPhone.replace(/\D/g, '') : ''
    const email = (order.email || order.customer?.email || '').trim().toLowerCase()

    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', userId)
    const sessionIds = (sessions || []).map((s) => s.id)

    let contactId: string | null = null
    let isWhatsapp = false
    if (sessionIds.length > 0 && (phone || email)) {
      let q = supabase
        .from('contacts')
        .select('id, opt_in_status')
        .in('session_id', sessionIds)
        .limit(1)
      if (phone) {
        q = q.eq('phone_number', phone)
      } else {
        q = q.or(`notify_email.ilike.${email},email.ilike.${email}`)
      }
      const { data: contact } = await q.maybeSingle()
      if (contact) {
        contactId = contact.id
        isWhatsapp = (contact as { opt_in_status?: string }).opt_in_status === 'subscribed'
      }
    }

    const total = order.total_price ? parseFloat(order.total_price) : 0
    // Date de la commande : Shopify envoie created_at sur le payload complet.
    const orderedAt = (order as { created_at?: string }).created_at || new Date().toISOString()
    // Pays (adresse de livraison d'abord, sinon facturation, sinon contact).
    const country = (
      order.shipping_address?.country_code
      || order.billing_address?.country_code
      || order.customer?.default_address?.country_code
      || ''
    ).toUpperCase() || null

    await supabase
      .from('shopify_orders')
      .upsert(
        {
          user_id: userId,
          store_id: storeId,
          shopify_order_id: shopifyOrderId,
          order_number: order.name || (order.order_number != null ? `#${order.order_number}` : null),
          total_price: isNaN(total) ? 0 : total,
          currency: order.currency || null,
          financial_status: (order as { financial_status?: string }).financial_status || null,
          fulfillment_status: (order as { fulfillment_status?: string }).fulfillment_status || null,
          contact_id: contactId,
          is_whatsapp: isWhatsapp,
          country,
          ordered_at: orderedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,shopify_order_id' }
      )
  } catch (err) {
    console.error('[persist-order] échec persistance commande:', err)
  }
}
