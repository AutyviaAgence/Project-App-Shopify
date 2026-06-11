import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptWabaToken } from '@/lib/messaging/send'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { encryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/conversations/new
 * Initie une conversation WhatsApp avec un nouveau numéro en envoyant un
 * template approuvé (seul moyen autorisé par Meta hors fenêtre 24h).
 * Crée le contact + la conversation + le message.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const phoneRaw = (body.phone as string || '').replace(/\D/g, '')
  const templateId = body.template_id as string | undefined
  const params = Array.isArray(body.template_params) ? (body.template_params as string[]) : []

  if (!phoneRaw) return NextResponse.json({ error: 'Numéro requis' }, { status: 400 })
  if (!templateId) return NextResponse.json({ error: 'Modèle requis' }, { status: 400 })

  // Session WhatsApp de l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_phone_number_id, waba_access_token')
    .eq('user_id', user.id)
    .eq('integration_type', 'waba')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session?.waba_phone_number_id) {
    return NextResponse.json({ error: 'Aucune session WhatsApp connectée' }, { status: 400 })
  }

  // Template approuvé
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status, body_text')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!tpl || tpl.status !== 'approved') {
    return NextResponse.json({ error: 'Modèle introuvable ou non approuvé' }, { status: 400 })
  }

  const token = decryptWabaToken(session)
  if (!token) return NextResponse.json({ error: 'Credentials WABA manquants' }, { status: 502 })

  // Envoi du template
  const components = params.length > 0
    ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
    : []
  const res = await wabaClient.sendTemplateWithParams(
    session.waba_phone_number_id, token, phoneRaw, tpl.name, tpl.language, components
  )
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })

  // Upsert contact + conversation + message
  const { data: contact } = await supabase
    .from('contacts')
    .upsert({ session_id: session.id, phone_number: phoneRaw }, { onConflict: 'session_id,phone_number' })
    .select()
    .single()
  if (!contact) return NextResponse.json({ error: 'Erreur contact' }, { status: 500 })

  const preview = tpl.body_text || `[Modèle : ${tpl.name}]`
  const { data: conversation } = await supabase
    .from('conversations')
    .upsert(
      { session_id: session.id, contact_id: contact.id, last_message_at: new Date().toISOString(), last_message_preview: preview },
      { onConflict: 'session_id,contact_id' }
    )
    .select()
    .single()
  if (!conversation) return NextResponse.json({ error: 'Erreur conversation' }, { status: 500 })

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    session_id: session.id,
    direction: 'outbound',
    content: encryptMessage(preview),
    message_type: 'text',
    sent_by: 'user',
    status: 'sent',
  })

  return NextResponse.json({ data: { conversation_id: conversation.id } })
}
