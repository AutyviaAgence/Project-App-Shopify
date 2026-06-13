import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { resolveVariables } from '@/lib/templates/variables'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const NO_WHATSAPP_CODES = [131026, 131047, 131000, 470]

/**
 * Envoie un template WhatsApp APPROUVÉ (par son id) à un contact, en résolvant
 * ses variables nommées depuis un contexte de données. Respecte l'opt-out.
 * Utilisé par le moteur d'automatisations (template choisi par le marchand).
 */
export async function sendTemplateToContact(params: {
  templateId: string
  contactId: string
  variables: Record<string, string>
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = admin()

  // Contact + opt-in
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id, phone_number, opt_in_status, preferred_channel')
    .eq('id', params.contactId)
    .maybeSingle()
  if (!contact) return { ok: false, error: 'contact_introuvable' }
  if (contact.opt_in_status === 'opted_out') return { ok: false, error: 'opted_out' }
  if (!contact.phone_number) return { ok: false, error: 'no_phone' }
  if (contact.preferred_channel === 'none') return { ok: false, error: 'pas_dopt_in_canal' }

  // Template approuvé
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status, variables_count, variable_keys, body_text, template_type, carousel_cards, lto_default_hours, buttons')
    .eq('id', params.templateId)
    .maybeSingle()
  if (!tpl) return { ok: false, error: 'template_introuvable' }
  if (tpl.status !== 'approved') return { ok: false, error: 'template_non_approuve' }

  // Session WABA
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_phone_number_id, waba_access_token')
    .eq('id', contact.session_id)
    .maybeSingle()
  if (!session?.waba_phone_number_id) return { ok: false, error: 'no_phone_number_id' }

  const { decryptWabaToken } = await import('@/lib/messaging/send')
  const token = decryptWabaToken(session)
  if (!token) return { ok: false, error: 'no_token' }

  // Résolution des variables nommées dans l'ordre.
  const keys = Array.isArray(tpl.variable_keys) ? tpl.variable_keys : []
  const varsCount = typeof tpl.variables_count === 'number' ? tpl.variables_count : keys.length
  const resolved = resolveVariables(keys, params.variables)
  const out = resolved.slice(0, varsCount)
  while (out.length < varsCount) out.push('')
  const components: unknown[] = out.length > 0
    ? [{ type: 'body', parameters: out.map((p) => ({ type: 'text', text: p })) }]
    : []

  // Carrousel avec variables par carte → ajoute le composant `carousel` résolu.
  if (tpl.template_type === 'carousel' && Array.isArray(tpl.carousel_cards)) {
    const { buildCarouselComponent } = await import('@/lib/templates/carousel-send')
    const carousel = buildCarouselComponent(tpl.carousel_cards, params.variables)
    if (carousel) components.push(carousel)
  }

  // Offre à durée limitée → composant d'expiration (compte à rebours).
  if (tpl.template_type === 'limited_time_offer') {
    const { buildLtoComponent } = await import('@/lib/templates/lto-send')
    components.push(buildLtoComponent({ defaultHours: tpl.lto_default_hours, nowMs: Date.now() }))
  }

  // Bouton "Copier le code" (COPY_CODE) — pour TOUT type de template. Meta exige
  // le paramètre coupon_code à l'envoi. On résout via la variable promo_code
  // (dynamique) sinon on retombe sur le code figé du template.
  {
    const btns = Array.isArray(tpl.buttons) ? tpl.buttons as { type?: string; code?: string }[] : []
    const codeIdx = btns.findIndex((b) => b.type === 'COPY_CODE')
    if (codeIdx >= 0) {
      const code = (params.variables.promo_code || btns[codeIdx].code || '').trim()
      if (code) {
        components.push({
          type: 'button',
          sub_type: 'copy_code',
          index: String(codeIdx),
          parameters: [{ type: 'coupon_code', coupon_code: code }],
        })
      }
    }
  }

  const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
  const res = await wabaClient.sendTemplateWithParams(
    session.waba_phone_number_id, token, contact.phone_number, tpl.name, tpl.language, components
  )
  if (!res.ok) {
    const raw = String(res.error || '')
    const code = raw.match(/"code"\s*:\s*(\d+)/)?.[1]
    const isNoWa = (code && NO_WHATSAPP_CODES.includes(Number(code))) || /not.*whatsapp|invalid.*recipient/i.test(raw)
    return { ok: false, error: isNoWa ? 'no_whatsapp' : `send_failed: ${raw.slice(0, 160)}` }
  }

  // Trace inbox (conversation + message sortant) pour visibilité côté agent.
  try {
    const { encryptMessage } = await import('@/lib/crypto/encryption')
    let preview = tpl.body_text || `[Modèle : ${tpl.name}]`
    out.forEach((v, i) => { preview = preview.replace(`{{${i + 1}}}`, v) })
    const { data: conv } = await supabase
      .from('conversations')
      .upsert(
        { session_id: contact.session_id, contact_id: contact.id, last_message_at: new Date().toISOString(), last_message_preview: preview },
        { onConflict: 'session_id,contact_id' }
      )
      .select()
      .single()
    if (conv) {
      await supabase.from('messages').insert({
        conversation_id: conv.id, session_id: contact.session_id, direction: 'outbound',
        content: encryptMessage(preview), message_type: 'text', sent_by: 'user', status: 'sent',
      })
    }
  } catch (e) {
    console.error('[automations] inbox trace échec (message envoyé):', e)
  }

  return { ok: true }
}
