import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pollImapInbox } from '@/lib/email/imap-poller'
import { pollGmailInbox } from '@/lib/email/gmail-client'
import { encryptMessage } from '@/lib/crypto/encryption'
import { uploadMedia } from '@/lib/storage/media'

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const headerSecret = req.headers.get('authorization')?.replace('Bearer ', '')
    ?? req.headers.get('x-cron-secret')
  const urlSecret = req.nextUrl.searchParams.get('secret')
  return headerSecret === cronSecret || urlSecret === cronSecret
}

/** GET /api/cron/poll-email — Polling IMAP pour les emails entrants (SMTP sessions) */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  return runPollEmail()
}

async function runPollEmail() {
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Renouveler le watch Gmail Pub/Sub (expire tous les 7 jours — on le renouvelle à chaque cron)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const cronSecret = process.env.CRON_SECRET
  if (appUrl && cronSecret) {
    fetch(`${appUrl}/api/email-sessions/watch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch((err) => console.warn('[poll-email] Gmail watch renewal failed:', err))
  }

  // Récupérer toutes les sessions email connectées avec credentials
  const { data: sessions, error } = await adminSupabase
    .from('email_sessions')
    .select('*')
    .eq('status', 'connected')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let totalEmails = 0
  const errors: { session_id: string; error: string }[] = []

  await Promise.all(sessions.map(async (session) => {
    try {
      const emails = session.provider === 'gmail'
        ? await pollGmailInbox(session)
        : await pollImapInbox(session)
      if (emails.length === 0) return

      // Ignorer les emails reçus avant la création de la session
      const sessionCreatedAt = new Date(session.created_at)
      const newEmails = emails.filter((e) => e.receivedAt >= sessionCreatedAt)
      if (newEmails.length === 0) return

      for (const email of newEmails) {
        // Trouver ou créer un contact basé sur l'adresse email de l'expéditeur
        let contactId: string

        const { data: existingContact } = await adminSupabase
          .from('contacts')
          .select('id')
          .eq('email', email.from)
          .eq('email_session_id', session.id)
          .maybeSingle()

        if (existingContact) {
          contactId = existingContact.id
        } else {
          const { data: newContact, error: contactError } = await adminSupabase
            .from('contacts')
            .insert({
              session_id: null,
              email_session_id: session.id,
              phone_number: email.from,
              email: email.from,
              name: email.fromName,
              first_name: email.fromName?.split(' ')[0] ?? null,
              last_name: email.fromName?.split(' ').slice(1).join(' ') || null,
            })
            .select('id')
            .single()

          if (contactError || !newContact) continue
          contactId = newContact.id
        }

        // Dédupliquer : ne pas traiter un message déjà en base
        if (email.messageId) {
          const { data: existingMsg } = await adminSupabase
            .from('messages')
            .select('id')
            .eq('channel_message_id', email.messageId)
            .maybeSingle()
          if (existingMsg) continue
        }

        // Trouver ou créer la conversation (unread_count incrémenté seulement pour les nouveaux messages)
        let conversationId: string

        const { data: existingConv } = await adminSupabase
          .from('conversations')
          .select('id, unread_count')
          .eq('contact_id', contactId)
          .eq('email_session_id', session.id)
          .eq('channel', 'email')
          .maybeSingle()

        if (existingConv) {
          conversationId = existingConv.id
          await adminSupabase
            .from('conversations')
            .update({
              last_message_at: email.receivedAt.toISOString(),
              last_message_preview: email.body.slice(0, 200),
              unread_count: (existingConv.unread_count ?? 0) + 1,
            })
            .eq('id', conversationId)
        } else {
          const { data: newConv, error: convError } = await adminSupabase
            .from('conversations')
            .insert({
              session_id: null,
              contact_id: contactId,
              channel: 'email',
              email_session_id: session.id,
              last_message_at: email.receivedAt.toISOString(),
              last_message_preview: email.body.slice(0, 200),
              unread_count: 1,
            })
            .select('id')
            .single()

          if (convError || !newConv) continue
          conversationId = newConv.id
        }

        // Créer le message texte (chiffré)
        const encryptedContent = encryptMessage(email.body)
        const messageSubject = email.subject

        const transcriptionParts: string[] = []
        if (messageSubject) transcriptionParts.push(`Objet: ${messageSubject}`)
        if (email.attachments?.length) transcriptionParts.push(`PJ: ${email.attachments.map(a => a.filename).join(', ')}`)

        const { error: msgInsertError } = await adminSupabase.from('messages').insert({
          conversation_id: conversationId,
          session_id: null,
          direction: 'inbound',
          content: encryptedContent,
          message_type: 'text',
          channel_message_id: email.messageId,
          sent_by: 'contact',
          status: 'delivered',
          ai_processed: false,
          ...(transcriptionParts.length > 0 ? { transcription: transcriptionParts.join('\n') } : {}),
        })

        if (!msgInsertError) totalEmails++

        // Uploader chaque PJ dans Storage et créer un message document par fichier
        for (const att of (email.attachments ?? [])) {
          const attMsgId = `in-att-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const storagePath = `email/${conversationId}/${attMsgId}-${att.filename}`
          const uploadResult = await uploadMedia({
            sessionId: 'email',
            messageId: attMsgId,
            buffer: att.content,
            mimeType: att.contentType,
            storagePath,
          })
          if (!uploadResult.ok) continue

          const isImage = att.contentType.startsWith('image/')
          const msgType = isImage ? 'image' : 'document'

          await adminSupabase.from('messages').insert({
            conversation_id: conversationId,
            session_id: null,
            direction: 'inbound',
            content: encryptMessage(`[${isImage ? 'Image' : 'Document'}: ${att.filename}]`),
            message_type: msgType,
            channel_message_id: attMsgId,
            sent_by: 'contact',
            status: 'delivered',
            ai_processed: false,
            media_url: uploadResult.storagePath,
            media_mime_type: att.contentType,
          })
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push({ session_id: session.id, error: errMsg })
      console.error(`[poll-email] Session ${session.id} error:`, errMsg)

      // Erreur d'authentification → marquer la session en erreur
      const isAuthError = errMsg.toLowerCase().includes('authentication failed')
        || errMsg.toLowerCase().includes('invalid credentials')
        || errMsg.toLowerCase().includes('auth failed')
        || errMsg.toLowerCase().includes('[authenticationfailed]')
      if (isAuthError) {
        await adminSupabase
          .from('email_sessions')
          .update({ status: 'error' })
          .eq('id', session.id)
        console.warn(`[poll-email] Session ${session.id} marked as error (auth failed)`)
      }
      // Erreurs réseau temporaires (timeout, self-signed cert...) → ne pas changer le statut
    }
  }))

  return NextResponse.json({
    processed: totalEmails,
    sessions_checked: sessions.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}

/** POST /api/cron/poll-email */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  return runPollEmail()
}
