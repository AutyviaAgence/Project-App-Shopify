import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { verifyWebhookHmac } from '@/lib/shopify/client'
import { sendNotification } from '@/lib/notifications/send'

/**
 * Webhook Shopify — orders/fulfilled
 * Déclenché quand une commande est expédiée. On notifie le client sur son
 * canal préféré (WhatsApp/Email) qu'elle est en route.
 *
 * Règle anti-doublon : on n'envoie QUE si le contact a un opt-in canal
 * (preferred_channel != 'none'). Si le marchand laisse Shopify gérer ses
 * emails par défaut, le client ne sera notifié par Xeyo que s'il l'a demandé.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256') || ''
  if (!verifyWebhookHmac(rawBody, hmac)) {
    return NextResponse.json({ error: 'HMAC invalide' }, { status: 401 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain') || ''
  const order = JSON.parse(rawBody || '{}') as {
    name?: string
    order_number?: number
    customer?: { phone?: string; email?: string }
    fulfillments?: { tracking_url?: string; tracking_number?: string }[]
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Retrouver la boutique → user
  const { data: store } = await admin
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', shopDomain)
    .maybeSingle()
  if (!store?.user_id) return NextResponse.json({ received: true })

  // Retrouver le contact correspondant (par téléphone)
  const phone = order.customer?.phone?.replace(/\D/g, '')
  if (!phone) return NextResponse.json({ received: true, skipped: 'no phone' })

  const { data: sessions } = await admin
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', store.user_id)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) return NextResponse.json({ received: true })

  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .in('session_id', sessionIds)
    .eq('phone_number', phone)
    .maybeSingle()
  if (!contact) return NextResponse.json({ received: true, skipped: 'no contact' })

  const orderName = order.name || `#${order.order_number || ''}`
  const tracking = order.fulfillments?.[0]?.tracking_url || ''

  // Notifier sur le canal préféré (le moteur respecte opt-in + canal)
  const result = await sendNotification({
    contactId: contact.id,
    kind: 'order_shipped',
    vars: { order: orderName, tracking: tracking || 'suivi disponible bientôt' },
    emailSubject: `Votre commande ${orderName} est en route 🚚`,
    emailBody: `Bonjour,\n\nVotre commande ${orderName} vient d'être expédiée.${tracking ? `\nSuivi : ${tracking}` : ''}\n\nMerci pour votre confiance.`,
  })

  return NextResponse.json({ received: true, sent: result.sent })
}
