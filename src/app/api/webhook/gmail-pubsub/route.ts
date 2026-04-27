import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pollGmailInbox } from '@/lib/email/gmail-client'
import { encryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/webhook/gmail-pubsub
 * Reçoit les notifications Pub/Sub de Gmail et traite les nouveaux emails.
 * Pub/Sub envoie un POST avec body: { message: { data: base64, messageId, publishTime }, subscription }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Pub/Sub envoie les données en base64 dans message.data
    // Pour Gmail watch(), le payload contient emailAddress et historyId
    const messageData = body?.message?.data
    if (!messageData) {
      return NextResponse.json({ ok: true }) // ACK vide
    }

    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8')) as {
      emailAddress?: string
      historyId?: string
    }

    const emailAddress = decoded.emailAddress
    if (!emailAddress) {
      return NextResponse.json({ ok: true })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Trouver la session Gmail correspondant à cet email
    const { data: session } = await adminSupabase
      .from('email_sessions')
      .select('*')
      .eq('email_address', emailAddress)
      .eq('provider', 'gmail')
      .eq('status', 'connected')
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ ok: true })
    }

    // Récupérer les nouveaux emails non lus
    const emails = await pollGmailInbox(session)
    if (emails.length === 0) {
      return NextResponse.json({ ok: true })
    }

    for (const email of emails) {
      // Trouver ou créer le contact
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

      // Insérer le message
      await adminSupabase.from('messages').insert({
        conversation_id: conversationId,
        session_id: null,
        direction: 'inbound',
        content: encryptMessage(email.body),
        message_type: 'text',
        channel_message_id: email.messageId,
        sent_by: 'contact',
        status: 'delivered',
        ai_processed: false,
        ...(email.subject ? { transcription: `Objet: ${email.subject}` } : {}),
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Toujours ACK pour éviter que Pub/Sub ne réessaie en boucle
    return NextResponse.json({ ok: true })
  }
}
