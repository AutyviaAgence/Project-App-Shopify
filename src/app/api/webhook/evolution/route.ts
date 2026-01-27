import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * POST /api/webhook/evolution
 * Reçoit les events de Evolution API (messages, connexion, QR code)
 * Utilise le service_role car pas d'auth utilisateur ici
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const payload = await req.json()
    const event = payload.event as string
    const instanceName = payload.instance as string

    if (!event || !instanceName) {
      return NextResponse.json({ error: 'Missing event or instance' }, { status: 400 })
    }

    // Trouver la session correspondante
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('instance_name', instanceName)
      .single()

    if (!session) {
      console.warn('[Webhook] Session not found:', instanceName)
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      case 'connection.update': {
        const state = payload.data?.state as string
        let status: string = session.status

        if (state === 'open') status = 'connected'
        else if (state === 'close') status = 'disconnected'
        else if (state === 'connecting') status = 'qr_pending'

        const updateData: Record<string, unknown> = { status }
        if (status === 'connected') {
          updateData.qr_code = null
          // Récupérer le numéro de téléphone si disponible
          const owner = payload.data?.instance?.owner
          if (owner) {
            updateData.phone_number = owner.split('@')[0]
          }
        }

        await supabase
          .from('whatsapp_sessions')
          .update(updateData)
          .eq('id', session.id)

        break
      }

      case 'qrcode.updated': {
        const base64 = payload.data?.qrcode?.base64
        if (base64) {
          await supabase
            .from('whatsapp_sessions')
            .update({ qr_code: base64, status: 'qr_pending' })
            .eq('id', session.id)
        }
        break
      }

      case 'messages.upsert': {
        const messageData = payload.data
        if (!messageData?.key?.remoteJid || messageData.key.remoteJid.endsWith('@g.us')) {
          // Ignorer les messages de groupe
          break
        }

        const remoteJid = messageData.key.remoteJid as string
        const phoneNumber = remoteJid.split('@')[0]
        const fromMe = messageData.key.fromMe as boolean
        const waMessageId = messageData.key.id as string
        const pushName = messageData.pushName as string | undefined
        const content = messageData.message?.conversation
          || messageData.message?.extendedTextMessage?.text
          || ''

        if (!content && !messageData.message) break

        // 1. Upsert contact
        const { data: contact } = await supabase
          .from('contacts')
          .upsert(
            {
              session_id: session.id,
              phone_number: phoneNumber,
              name: pushName || null,
            },
            { onConflict: 'session_id,phone_number' }
          )
          .select()
          .single()

        if (!contact) break

        // Mettre à jour le nom si pushName disponible et pas encore de nom
        if (pushName && !contact.name) {
          await supabase
            .from('contacts')
            .update({ name: pushName })
            .eq('id', contact.id)
        }

        // 2. Upsert conversation
        const { data: conversation } = await supabase
          .from('conversations')
          .upsert(
            {
              session_id: session.id,
              contact_id: contact.id,
              last_message_at: new Date().toISOString(),
              last_message_preview: typeof content === 'string' ? content.slice(0, 100) : '',
            },
            { onConflict: 'session_id,contact_id' }
          )
          .select()
          .single()

        if (!conversation) break

        // Incrémenter unread si message entrant
        if (!fromMe) {
          await supabase
            .from('conversations')
            .update({
              unread_count: (conversation.unread_count || 0) + 1,
              last_message_at: new Date().toISOString(),
              last_message_preview: typeof content === 'string' ? content.slice(0, 100) : '',
            })
            .eq('id', conversation.id)
        }

        // 3. Insérer le message (dédupliqué via index unique wa_message_id)
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            session_id: session.id,
            direction: fromMe ? 'outbound' : 'inbound',
            content: content || '',
            message_type: 'text',
            wa_message_id: waMessageId,
            sent_by: fromMe ? 'user' : 'contact',
            status: 'delivered',
          })
          .select()
          .single()

        break
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ ok: true }) // Toujours 200 pour éviter les retries Evolution
  }
}
