import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import type { EventContext } from './types'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Forme partielle d'une commande Shopify (champs utilisés). */
export type ShopifyOrder = {
  id?: number
  name?: string
  order_number?: number
  order_status_url?: string
  total_price?: string
  currency?: string
  cancelled_at?: string | null
  customer?: {
    phone?: string
    email?: string
    first_name?: string
    last_name?: string
    orders_count?: number
  }
  fulfillments?: { tracking_url?: string; tracking_number?: string }[]
}

/** Boutique → user_id. */
export async function resolveStoreUser(shopDomain: string): Promise<string | null> {
  const { data } = await admin()
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  return data?.user_id ?? null
}

/**
 * Trouve (ou crée) le contact correspondant à une commande, et construit le
 * contexte d'événement (variables nommées + données pour les conditions).
 */
export async function buildOrderContext(
  userId: string,
  order: ShopifyOrder,
  statusLabel: string
): Promise<EventContext | null> {
  const supabase = admin()
  const phone = order.customer?.phone?.replace(/\D/g, '')
  if (!phone) return null

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', userId)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) return null

  let { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .in('session_id', sessionIds)
    .eq('phone_number', phone)
    .maybeSingle()

  if (!contact) {
    const fullName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ').trim() || null
    const { data: created } = await supabase
      .from('contacts')
      .insert({
        session_id: sessionIds[0],
        phone_number: phone,
        name: fullName,
        notify_email: order.customer?.email || null,
      })
      .select('id')
      .single()
    contact = created || null
  }
  if (!contact) return null

  const firstName = order.customer?.first_name || ''
  const lastName = order.customer?.last_name || ''
  const orderName = order.name || `#${order.order_number || ''}`
  const total = order.total_price ? parseFloat(order.total_price) : undefined
  const tracking = order.fulfillments?.[0]?.tracking_url || ''

  return {
    contactId: contact.id,
    total,
    isFirstOrder: typeof order.customer?.orders_count === 'number' ? order.customer.orders_count <= 1 : undefined,
    dedupKey: order.id ? String(order.id) : orderName,
    variables: {
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_full_name: [firstName, lastName].filter(Boolean).join(' '),
      customer_phone: order.customer?.phone || '',
      customer_email: order.customer?.email || '',
      order_number: orderName,
      order_total: order.total_price ? `${order.total_price}${order.currency ? ' ' + order.currency : ''}` : '',
      order_status: statusLabel,
      tracking_number: order.fulfillments?.[0]?.tracking_number || '',
      tracking_url: tracking,
      order_status_url: order.order_status_url || '',
    },
  }
}
