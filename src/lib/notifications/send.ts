import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * Moteur de notifications transactionnelles multi-canal.
 *
 * À partir d'un contact et d'une notification (ex: "commande expédiée"),
 * route vers le canal choisi par le client (preferred_channel) :
 *   - whatsapp → template WhatsApp
 *   - email    → email transactionnel
 *   - both     → les deux
 *   - none     → rien (pas d'opt-in notif)
 *
 * Respecte l'opt-out : si opt_in_status = 'opted_out', on n'envoie rien.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type NotificationKind = 'order_shipped' | 'order_delivered' | 'order_confirmed'

export type NotificationPayload = {
  contactId: string
  kind: NotificationKind
  // Variables d'affichage (n° commande, lien suivi…)
  vars: Record<string, string>
  // Sujet/corps email (si canal email)
  emailSubject?: string
  emailBody?: string
}

type Channel = 'none' | 'whatsapp' | 'email' | 'both'

/**
 * Envoie une notification au contact sur son/ses canal(aux) préféré(s).
 * Retourne les canaux effectivement utilisés.
 */
export async function sendNotification(payload: NotificationPayload): Promise<{ sent: string[]; skipped?: string }> {
  const supabase = admin()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id, phone_number, preferred_channel, notify_email, opt_in_status')
    .eq('id', payload.contactId)
    .maybeSingle()

  if (!contact) return { sent: [], skipped: 'contact introuvable' }

  // Respect de l'opt-out global
  if (contact.opt_in_status === 'opted_out') {
    return { sent: [], skipped: 'opted_out' }
  }

  const channel = (contact.preferred_channel || 'none') as Channel
  if (channel === 'none') return { sent: [], skipped: 'pas de canal opt-in' }

  const sent: string[] = []

  // WhatsApp
  if ((channel === 'whatsapp' || channel === 'both') && contact.phone_number) {
    const ok = await sendWhatsAppNotification(contact.session_id, contact.phone_number, payload)
    if (ok) sent.push('whatsapp')
  }

  // Email
  if ((channel === 'email' || channel === 'both')) {
    const to = contact.notify_email || null
    if (to && payload.emailSubject && payload.emailBody) {
      const ok = await sendEmailNotification(contact.session_id, to, payload)
      if (ok) sent.push('email')
    }
  }

  return { sent }
}

/** Envoie un template WhatsApp pour la notification (selon le kind). */
async function sendWhatsAppNotification(
  sessionId: string | null,
  phone: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!sessionId) return false
  try {
    const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
    const { decryptWabaToken } = await import('@/lib/messaging/send')
    const { DEFAULT_TEMPLATES } = await import('@/lib/whatsapp-cloud/default-templates')

    // Récupérer la session WABA (credentials)
    const supabase = admin()
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('waba_phone_number_id, waba_access_token')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session?.waba_phone_number_id) return false
    const token = decryptWabaToken(session)
    if (!token) return false

    // Mapper le kind vers un template par défaut
    const templateKey = payload.kind === 'order_shipped' ? 'order_shipped'
      : payload.kind === 'order_delivered' ? 'order_delivered'
      : 'order_confirmation'
    const tpl = DEFAULT_TEMPLATES.find((t) => t.key === templateKey)
    if (!tpl) return false

    // Composants Meta : paramètres du corps dans l'ordre des variables
    const params = Object.values(payload.vars)
    const components = params.length > 0
      ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
      : []

    const res = await wabaClient.sendTemplateWithParams(
      session.waba_phone_number_id,
      token,
      phone,
      tpl.name,
      tpl.language,
      components
    )
    return res.ok
  } catch (e) {
    console.error('[Notif] WhatsApp échec:', e)
    return false
  }
}

/** Envoie un email transactionnel via la session email du compte. */
async function sendEmailNotification(
  sessionId: string | null,
  to: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const supabase = admin()
    // Récupérer la 1re session email du même user que la session WhatsApp
    const { data: waSession } = await supabase
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!waSession?.user_id) return false

    const { data: emailSession } = await supabase
      .from('email_sessions')
      .select('*')
      .eq('user_id', waSession.user_id)
      .limit(1)
      .maybeSingle()
    if (!emailSession) return false

    const { sendEmailViaSmtp } = await import('@/lib/email/client')
    await sendEmailViaSmtp(emailSession, to, payload.emailSubject!, payload.emailBody!)
    return true
  } catch (e) {
    console.error('[Notif] Email échec:', e)
    return false
  }
}
