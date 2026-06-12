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
  // Variables d'affichage par POSITION ({{1}}, {{2}}…) — rétrocompat / fallback
  // quand le template n'a pas de mapping de variables nommées.
  vars: Record<string, string>
  // Contexte de données par CLÉ nommée (customer_first_name, order_number…).
  // Si le template a un `variable_keys`, les paramètres sont résolus depuis ici.
  data?: import('@/lib/templates/variables').VariableContext
  // Sujet/corps email (si canal email)
  emailSubject?: string
  emailBody?: string
}

type Channel = 'none' | 'whatsapp' | 'email' | 'both'

/**
 * Envoie une notification au contact sur son/ses canal(aux) préféré(s).
 * Retourne les canaux effectivement utilisés.
 */
export async function sendNotification(payload: NotificationPayload): Promise<{ sent: string[]; skipped?: string; error?: string }> {
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
  let error: string | undefined

  // WhatsApp
  if ((channel === 'whatsapp' || channel === 'both') && contact.phone_number) {
    const r = await sendWhatsAppNotification(contact.session_id, contact.phone_number, payload)
    if (r.ok) sent.push('whatsapp')
    else error = r.error
  }

  // Email
  if ((channel === 'email' || channel === 'both')) {
    const to = contact.notify_email || null
    if (to && payload.emailSubject && payload.emailBody) {
      const ok = await sendEmailNotification(contact.session_id, to, payload)
      if (ok) sent.push('email')
    }
  }

  return { sent, error }
}

// Codes d'erreur Meta indiquant que le numéro n'a pas de compte WhatsApp
// (ou n'est pas joignable). On les remonte comme "no_whatsapp".
const NO_WHATSAPP_CODES = [131026, 131047, 131000, 470]

/** Envoie un template WhatsApp pour la notification (selon le kind). */
async function sendWhatsAppNotification(
  sessionId: string | null,
  phone: string,
  payload: NotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  if (!sessionId) return { ok: false, error: 'no_session' }
  try {
    const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
    const { decryptWabaToken } = await import('@/lib/messaging/send')
    const { DEFAULT_TEMPLATES } = await import('@/lib/whatsapp-cloud/default-templates')

    // Récupérer la session WABA (credentials + user pour ses templates)
    const supabase = admin()
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('waba_phone_number_id, waba_access_token, user_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session?.waba_phone_number_id) return { ok: false, error: 'no_phone_number_id' }
    const token = decryptWabaToken(session)
    if (!token) return { ok: false, error: 'no_token' }

    // Mapper le kind vers le template par défaut (nom/langue/structure attendus)
    const templateKey = payload.kind === 'order_shipped' ? 'order_shipped'
      : payload.kind === 'order_delivered' ? 'order_delivered'
      : 'order_confirmation'
    const tpl = DEFAULT_TEMPLATES.find((t) => t.key === templateKey)
    if (!tpl) return { ok: false, error: 'no_template' }

    // Source de vérité : le template RÉELLEMENT approuvé par Meta côté marchand.
    // On envoie avec le nom/langue tels qu'approuvés (sinon Meta renvoie 132001).
    let sendName = tpl.name
    let sendLang = tpl.language
    let varsCount = tpl.sample_values.length
    let variableKeys: string[] = []
    let carouselCards: unknown[] | null = null
    if (session.user_id) {
      const { data: approved } = await supabase
        .from('whatsapp_templates')
        .select('name, language, status, variables_count, variable_keys, template_type, carousel_cards')
        .eq('user_id', session.user_id)
        .eq('name', tpl.name)
        .eq('status', 'approved')
        .maybeSingle()
      if (!approved) {
        // Pas approuvé pour ce marchand → ne pas tenter (échec garanti côté Meta).
        return { ok: false, error: `template_not_approved: ${tpl.name}` }
      }
      sendName = approved.name
      sendLang = approved.language || tpl.language
      if (typeof approved.variables_count === 'number') varsCount = approved.variables_count
      if (Array.isArray(approved.variable_keys)) variableKeys = approved.variable_keys
      if (approved.template_type === 'carousel' && Array.isArray(approved.carousel_cards)) {
        carouselCards = approved.carousel_cards
      }
    }

    // Paramètres : si le template a un mapping de variables nommées ET qu'un
    // contexte de données est fourni, on résout chaque {{n}} vers sa vraie
    // valeur (prénom client, n° commande…). Sinon, fallback sur les valeurs
    // positionnelles de payload.vars (rétrocompat).
    const { resolveVariables } = await import('@/lib/templates/variables')
    const allParams = (variableKeys.length > 0 && payload.data)
      ? resolveVariables(variableKeys, payload.data)
      : Object.values(payload.vars)

    // On fournit exactement le nb de variables attendu par le template approuvé
    // (tronqué/complété), sinon Meta rejette (132000).
    const params = allParams.slice(0, varsCount)
    while (params.length < varsCount) params.push('')
    const components: unknown[] = params.length > 0
      ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
      : []

    // Carrousel avec variables par carte → composant `carousel` résolu.
    if (carouselCards && payload.data) {
      const { buildCarouselComponent } = await import('@/lib/templates/carousel-send')
      const carousel = buildCarouselComponent(carouselCards as { body_text?: string; body_variable_keys?: string[] }[], payload.data)
      if (carousel) components.push(carousel)
    }

    const res = await wabaClient.sendTemplateWithParams(
      session.waba_phone_number_id,
      token,
      phone,
      sendName,
      sendLang,
      components
    )
    if (!res.ok) {
      // Détecter un numéro sans WhatsApp à partir du code d'erreur Meta.
      const raw = String(res.error || '')
      const codeMatch = raw.match(/"code"\s*:\s*(\d+)/)
      const code = codeMatch ? Number(codeMatch[1]) : null
      const isNoWhatsapp = (code !== null && NO_WHATSAPP_CODES.includes(code))
        || /not.*whatsapp|recipient.*not|invalid.*recipient/i.test(raw)
      console.error('[Notif] WhatsApp envoi refusé:', raw)
      return { ok: false, error: isNoWhatsapp ? 'no_whatsapp' : `send_failed: ${raw.slice(0, 200)}` }
    }

    // Enregistrer dans l'inbox : conversation + message sortant (visible côté agent)
    try {
      const { encryptMessage } = await import('@/lib/crypto/encryption')
      // Corps du template avec variables remplacées (pour l'aperçu en inbox)
      let preview = tpl.body_text || `[Modèle : ${tpl.name}]`
      params.forEach((v, i) => { preview = preview.replace(`{{${i + 1}}}`, v) })

      const { data: conversation } = await supabase
        .from('conversations')
        .upsert(
          { session_id: sessionId, contact_id: payload.contactId, last_message_at: new Date().toISOString(), last_message_preview: preview },
          { onConflict: 'session_id,contact_id' }
        )
        .select()
        .single()

      if (conversation) {
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          session_id: sessionId,
          direction: 'outbound',
          content: encryptMessage(preview),
          message_type: 'text',
          sent_by: 'user',
          status: 'sent',
        })
      }
    } catch (e) {
      console.error('[Notif] Enregistrement inbox échec (message envoyé quand même):', e)
    }

    return { ok: true }
  } catch (e) {
    console.error('[Notif] WhatsApp échec:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'exception' }
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
