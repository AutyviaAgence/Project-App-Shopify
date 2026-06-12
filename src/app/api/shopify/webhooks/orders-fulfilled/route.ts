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
    order_status_url?: string
    total_price?: string
    currency?: string
    customer?: { phone?: string; email?: string; first_name?: string; last_name?: string }
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

  let { data: contact } = await admin
    .from('contacts')
    .select('id')
    .in('session_id', sessionIds)
    .eq('phone_number', phone)
    .maybeSingle()

  // Créer le contact automatiquement depuis les données Shopify s'il n'existe pas.
  // (L'envoi reste conditionné à l'opt-in canal, géré par sendNotification.)
  if (!contact) {
    const fullName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ').trim() || null
    const { data: created } = await admin
      .from('contacts')
      .insert({
        session_id: sessionIds[0],
        phone_number: phone,
        name: fullName,
        notify_email: order.customer?.email || null,
      })
      .select('id')
      .single()
    if (!created) return NextResponse.json({ received: true, skipped: 'contact creation failed' })
    contact = created
  }

  const orderName = order.name || `#${order.order_number || ''}`
  const tracking = order.fulfillments?.[0]?.tracking_url || ''
  const firstName = order.customer?.first_name || ''
  const lastName = order.customer?.last_name || ''
  const total = order.total_price ? `${order.total_price}${order.currency ? ' ' + order.currency : ''}` : ''

  // Notifier sur le canal préféré (le moteur respecte opt-in + canal)
  const result = await sendNotification({
    contactId: contact.id,
    kind: 'order_shipped',
    vars: { order: orderName, tracking: tracking || 'suivi disponible bientôt' },
    // Contexte par clé nommée pour les templates à variables nommées.
    data: {
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_full_name: [firstName, lastName].filter(Boolean).join(' '),
      customer_phone: order.customer?.phone || '',
      customer_email: order.customer?.email || '',
      order_number: orderName,
      order_total: total,
      order_status: 'Expédiée',
      tracking_number: order.fulfillments?.[0]?.tracking_number || '',
      tracking_url: tracking,
      order_status_url: order.order_status_url || '',
    },
    emailSubject: `Votre commande ${orderName} est en route 🚚`,
    emailBody: `Bonjour,\n\nVotre commande ${orderName} vient d'être expédiée.${tracking ? `\nSuivi : ${tracking}` : ''}\n\nMerci pour votre confiance.`,
  })

  // Déclencheur campagne auto : événement Shopify "order_fulfilled"
  const { data: autoCampaigns } = await admin
    .from('campaigns')
    .select('id')
    .eq('user_id', store.user_id)
    .eq('campaign_mode', 'auto')
    .eq('is_active', true)
    .eq('trigger_type', 'shopify_event')
    .eq('trigger_event', 'order_fulfilled')
  if (autoCampaigns && autoCampaigns.length > 0) {
    const { startCampaignExecution } = await import('@/lib/campaigns/executor')
    for (const c of autoCampaigns) {
      await admin.from('campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', c.id)
      startCampaignExecution(c.id)
    }
  }

  return NextResponse.json({ received: true, sent: result.sent })
}
