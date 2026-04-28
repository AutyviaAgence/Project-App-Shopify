import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendEmailViaSmtp } from '@/lib/email/client'
import { sendEmailViaGmail } from '@/lib/email/gmail-client'
import { encryptMessage } from '@/lib/crypto/encryption'

/** POST /api/email/send — Envoyer un email depuis la inbox */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { conversation_id, content, subject } = body as {
    conversation_id?: string
    content?: string
    subject?: string
  }

  if (!conversation_id || !content) {
    return NextResponse.json({ error: 'conversation_id et content requis' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer la conversation ET vérifier ownership via email_session en une requête
  const { data: conversation, error: convError } = await adminSupabase
    .from('conversations')
    .select('id, channel, email_session_id, contact_id')
    .eq('id', conversation_id)
    .single() as { data: { id: string; channel: string; email_session_id: string | null; contact_id: string } | null; error: unknown }

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  if (conversation.channel !== 'email') {
    return NextResponse.json({ error: 'Cette conversation n\'est pas de type email' }, { status: 400 })
  }

  if (!conversation.email_session_id) {
    return NextResponse.json({ error: 'Session email manquante sur la conversation' }, { status: 400 })
  }

  // Récupérer la session email ET vérifier que l'utilisateur en est le propriétaire
  const { data: emailSession, error: sessionError } = await adminSupabase
    .from('email_sessions')
    .select('*')
    .eq('id', conversation.email_session_id)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !emailSession) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer le contact (destinataire)
  const { data: contact } = await supabase
    .from('contacts')
    .select('email, phone_number')
    .eq('id', conversation.contact_id)
    .single() as { data: { email: string | null; phone_number: string } | null }

  const recipientEmail = contact?.email ?? contact?.phone_number
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return NextResponse.json({ error: 'Adresse email du destinataire introuvable' }, { status: 400 })
  }

  try {
    if (emailSession.provider === 'gmail') {
      await sendEmailViaGmail(emailSession, recipientEmail, subject ?? 'Re:', content)
    } else {
      await sendEmailViaSmtp(emailSession, recipientEmail, subject ?? 'Re:', content)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erreur envoi email: ${errMsg}` }, { status: 500 })
  }

  // Sauvegarder le message dans la DB
  const messageId = `out-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const encryptedContent = encryptMessage(content)

  const { data: message, error: msgError } = await adminSupabase
    .from('messages')
    .insert({
      conversation_id,
      session_id: null,
      direction: 'outbound',
      content: encryptedContent,
      message_type: 'text',
      channel_message_id: messageId,
      sent_by: 'user',
      status: 'sent',
      ai_processed: false,
      ...(subject ? { transcription: `Objet: ${subject}` } : {}),
    })
    .select()
    .single()

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  // Mettre à jour la conversation
  await adminSupabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 200),
    })
    .eq('id', conversation_id)

  return NextResponse.json({ data: message })
}
