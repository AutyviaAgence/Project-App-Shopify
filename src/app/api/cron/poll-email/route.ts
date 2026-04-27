import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pollImapInbox } from '@/lib/email/imap-poller'
import { pollGmailInbox } from '@/lib/email/gmail-client'
import { encryptMessage } from '@/lib/crypto/encryption'

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true
  const headerSecret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  const querySecret = req.nextUrl.searchParams.get('secret')
  return headerSecret === cronSecret || querySecret === cronSecret
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

      for (const email of emails) {
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

        // Trouver ou créer la conversation
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

        // Créer le message (chiffré)
        const encryptedContent = encryptMessage(email.body)
        const messageSubject = email.subject

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
          // Store subject in a structured way within content prefix
          ...(messageSubject ? { transcription: `Objet: ${messageSubject}` } : {}),
        })

        if (!msgInsertError) totalEmails++
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push({ session_id: session.id, error: errMsg })

      // Marquer la session en erreur si IMAP échoue
      await adminSupabase
        .from('email_sessions')
        .update({ status: 'error' })
        .eq('id', session.id)
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
