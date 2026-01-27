import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { processAIResponse } from '@/lib/openai/process-ai-response'
import { processMediaMessage } from '@/lib/openai/media-processor'

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
          const owner = payload.data?.instance?.owner || payload.data?.instance?.ownerJid
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

        // Traitement média : détecte le type et extrait/transcrit/décrit le contenu
        const mediaResult = await processMediaMessage(
          messageData.message || {},
          instanceName,
          waMessageId,
          remoteJid
        )
        const content = mediaResult.content
        const messageType = mediaResult.messageType

        // Ignorer seulement les messages texte vides sans payload
        if (!content && messageType === 'text' && !messageData.message) break

        // Aperçu adapté au type pour la conversation
        const previewContent = messageType === 'text'
          ? (content || '').slice(0, 100)
          : messageType === 'audio' ? 'Message vocal'
          : messageType === 'image' ? 'Photo'
          : messageType === 'video' ? 'Vidéo'
          : messageType === 'document' ? 'Document'
          : messageType === 'sticker' ? 'Sticker'
          : (content || '').slice(0, 100)

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
              last_message_preview: previewContent,
            },
            { onConflict: 'session_id,contact_id' }
          )
          .select()
          .single()

        if (!conversation) break

        // 2b. Auto-assign agent IA depuis un lien WA (nouvelles conversations)
        if (!fromMe && !conversation.ai_agent_id) {
          let matchingLink = null
          if (content) {
            const { data: exactMatch } = await supabase
              .from('wa_links')
              .select('id, ai_agent_id')
              .eq('session_id', session.id)
              .eq('is_active', true)
              .not('ai_agent_id', 'is', null)
              .eq('pre_filled_message', content)
              .limit(1)
              .maybeSingle()
            matchingLink = exactMatch
          }

          if (matchingLink?.ai_agent_id) {
            await supabase
              .from('conversations')
              .update({
                ai_agent_id: matchingLink.ai_agent_id,
                is_ai_active: true,
                wa_link_id: matchingLink.id,
              })
              .eq('id', conversation.id)
            console.log('[Webhook] Auto-assigned agent from WA link:', matchingLink.id)
          }
        }

        // Incrémenter unread si message entrant
        if (!fromMe) {
          await supabase
            .from('conversations')
            .update({
              unread_count: (conversation.unread_count || 0) + 1,
              last_message_at: new Date().toISOString(),
              last_message_preview: previewContent,
            })
            .eq('id', conversation.id)
        }

        // 3. Insérer le message (dédupliqué via index unique wa_message_id)
        const { data: insertedMessage } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            session_id: session.id,
            direction: fromMe ? 'outbound' : 'inbound',
            content: content || '',
            message_type: messageType,
            media_url: mediaResult.mediaUrl,
            wa_message_id: waMessageId,
            sent_by: fromMe ? 'user' : 'contact',
            status: 'delivered',
            ai_processed: false,
          })
          .select()
          .single()

        // 4. Auto-réponse IA (avec support délai/debounce)
        if (!fromMe) {
          const { data: convFresh } = await supabase
            .from('conversations')
            .select('is_ai_active, ai_agent_id')
            .eq('id', conversation.id)
            .single()

          console.log('[Webhook] AI check:', {
            convId: conversation.id,
            is_ai_active: convFresh?.is_ai_active,
            ai_agent_id: convFresh?.ai_agent_id,
            messageType,
          })

          if (convFresh?.is_ai_active && convFresh?.ai_agent_id) {
            // Récupérer le délai configuré sur l'agent
            const { data: agentConfig } = await supabase
              .from('ai_agents')
              .select('response_delay')
              .eq('id', convFresh.ai_agent_id)
              .single()

            const delay = agentConfig?.response_delay ?? 0

            if (delay > 0) {
              console.log(`[Webhook] Waiting ${delay}s (debounce)...`)
              await new Promise(resolve => setTimeout(resolve, delay * 1000))

              // Vérifier si ce message est toujours le plus récent inbound
              const { data: latestMsg } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversation.id)
                .eq('direction', 'inbound')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (latestMsg?.id !== insertedMessage?.id) {
                console.log('[Webhook] Newer message exists, skipping AI (debounce)')
                break
              }
            }

            console.log('[Webhook] Triggering AI response...')
            await processAIResponse({
              conversationId: conversation.id,
              sessionId: session.id,
              instanceName: instanceName,
              contactPhoneNumber: phoneNumber,
              agentId: convFresh.ai_agent_id,
            })
            console.log('[Webhook] AI response done')
          }
        }

        break
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ ok: true }) // Toujours 200 pour éviter les retries Evolution
  }
}
