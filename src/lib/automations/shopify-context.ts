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
  // Langue de la commande, choisie par le client au checkout (ex: 'fr', 'de-DE').
  customer_locale?: string | null
  // Téléphone de la commande (souvent rempli au checkout au lieu de customer.phone).
  phone?: string | null
  // Email du checkout (toujours présent quand le client saisit ses infos) →
  // sert à relier un panier abandonné au contact opted-in via la popup.
  email?: string | null
  customer?: {
    phone?: string | null
    email?: string
    first_name?: string
    last_name?: string
    orders_count?: number
    locale?: string | null
    default_address?: { phone?: string | null; country_code?: string | null } | null
  }
  shipping_address?: { phone?: string | null; country_code?: string | null } | null
  billing_address?: { phone?: string | null; country_code?: string | null } | null
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

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', userId)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) return null

  // Le numéro saisi au checkout peut arriver dans plusieurs champs selon Shopify
  // (customer.phone n'est PAS toujours rempli). On les essaie dans l'ordre.
  const rawPhone =
    order.customer?.phone
    || order.phone
    || order.shipping_address?.phone
    || order.billing_address?.phone
    || order.customer?.default_address?.phone
    || null
  let phone = rawPhone ? rawPhone.replace(/\D/g, '') : ''
  const email = (order.email || order.customer?.email || '').trim().toLowerCase()

  // CAS PANIER ABANDONNÉ : souvent pas de numéro dans le checkout, mais le client
  // a donné son numéro via la POPUP d'opt-in. On relie alors par EMAIL : on
  // cherche un contact opted-in avec cet email et on récupère SON numéro.
  if (!phone && email) {
    const { data: byEmail } = await supabase
      .from('contacts')
      .select('phone_number')
      .in('session_id', sessionIds)
      .or(`notify_email.ilike.${email},email.ilike.${email}`)
      .not('phone_number', 'is', null)
      .neq('phone_number', '')
      .limit(1)
      .maybeSingle()
    if (byEmail?.phone_number) phone = byEmail.phone_number.replace(/\D/g, '')
  }

  if (!phone) {
    console.warn('[shopify-context] pas de numéro (ni checkout ni contact opted-in par email) → skip')
    return null
  }

  // Langue du client : locale Shopify d'abord, sinon pays de livraison/facturation.
  const { resolveContactLanguage } = await import('@/lib/i18n/contact-language')
  const lang = resolveContactLanguage({
    shopifyLocale: order.customer_locale || order.customer?.locale,
    country: order.shipping_address?.country_code || order.billing_address?.country_code || order.customer?.default_address?.country_code,
  })

  let { data: contact } = await supabase
    .from('contacts')
    .select('id, preferred_language')
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
        notify_email: order.customer?.email || order.email || null,
        preferred_language: lang?.language || null,
        language_source: lang?.source || null,
      })
      .select('id, preferred_language')
      .single()
    contact = created || null
  } else if (lang && !(contact as { preferred_language?: string | null }).preferred_language) {
    // Contact existant sans langue → on l'enrichit (Shopify est fiable).
    await supabase
      .from('contacts')
      .update({ preferred_language: lang.language, language_source: lang.source })
      .eq('id', contact.id)
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
