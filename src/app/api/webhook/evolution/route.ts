import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { processAIResponse } from '@/lib/openai/process-ai-response'
import { processMediaMessage } from '@/lib/openai/media-processor'
import { recordTokenUsage } from '@/lib/openai/token-tracker'
import { evolution } from '@/lib/evolution/client'
import { syncContactsFromWhatsApp } from '@/lib/evolution/sync-contacts'
import { encryptMessage } from '@/lib/crypto/encryption'
import { uploadMedia } from '@/lib/storage/media'
import { checkRateLimit } from '@/lib/rate-limit'

// Mots-clés opt-out par défaut (synchronisés avec campaign_opt_out_keywords table)
const DEFAULT_OPT_OUT_KEYWORDS = [
  'stop', 'arrêter', 'arreter', 'désabonner', 'desabonner',
  'unsubscribe', 'ne plus recevoir', 'spam', 'harcèlement', 'harcelement'
]

/**
 * Vérifie si un message contient un mot-clé opt-out
 */
function containsOptOutKeyword(message: string, keywords: string[]): string | null {
  const lowerMessage = message.toLowerCase().trim()
  for (const keyword of keywords) {
    if (lowerMessage === keyword || lowerMessage.includes(keyword)) {
      return keyword
    }
  }
  return null
}

/**
 * POST /api/webhook/evolution
 * Reçoit les events de Evolution API (messages, connexion, QR code)
 * Utilise le service_role car pas d'auth utilisateur ici
 */
export async function POST(req: NextRequest) {
  // Rate limiting pour le webhook (1000/min)
  const rateLimitResponse = checkRateLimit(req, 'WEBHOOK')
  if (rateLimitResponse) return rateLimitResponse
  const startTime = Date.now()
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let logStatus: 'success' | 'error' | 'skipped' = 'success'
  let logError: string | null = null
  let sessionId: string | null = null

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
      logStatus = 'skipped'
      logError = 'Session not found'
      // Log anyway with null session_id
      await supabase.from('webhook_logs').insert({
        session_id: null,
        event_type: event,
        instance_name: instanceName,
        payload,
        status: logStatus,
        error_message: logError,
        processing_time_ms: Date.now() - startTime,
      })
      return NextResponse.json({ ok: true })
    }

    sessionId = session.id

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
          updateData.pairing_code = null
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

        // Créer une alerte si session déconnectée
        if (state === 'close' && session.status === 'connected') {
          await supabase.from('user_alerts').insert({
            user_id: session.user_id,
            alert_type: 'session_disconnected',
            title: 'Session déconnectée',
            message: `La session "${session.instance_name}" a été déconnectée. Reconnectez-vous via le QR code.`,
            metadata: { session_id: session.id, instance_name: session.instance_name },
          })
        }

        // Synchroniser les contacts automatiquement à la connexion
        if (state === 'open' && session.status !== 'connected') {
          console.log('[Webhook] Session connected, syncing contacts...')
          // Lancer la sync en arrière-plan (ne pas bloquer le webhook)
          syncContactsFromWhatsApp(supabase, session.id, instanceName)
            .then(result => {
              console.log(`[Webhook] Contact sync complete: ${result.synced} synced, ${result.skipped} skipped`)
            })
            .catch(err => {
              console.error('[Webhook] Contact sync failed:', err)
            })
        }

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

        // Enregistrer les tokens utilisés par le traitement média (transcription, vision)
        if (mediaResult.tokensUsed > 0 && session.user_id) {
          recordTokenUsage(session.user_id, mediaResult.tokensUsed).catch(err =>
            console.error('[Webhook] Token recording error:', err)
          )
        }

        // Upload média dans Supabase Storage si le buffer est disponible
        let storagePath: string | null = null
        if (mediaResult.mediaBuffer && waMessageId) {
          try {
            const uploadResult = await uploadMedia({
              sessionId: session.id,
              messageId: waMessageId,
              buffer: mediaResult.mediaBuffer,
              mimeType: mediaResult.mediaMimeType || 'application/octet-stream',
            })
            if (uploadResult.ok) {
              storagePath = uploadResult.storagePath
            } else {
              console.warn('[Webhook] Media upload failed:', uploadResult.error)
            }
          } catch (uploadErr) {
            console.error('[Webhook] Media upload error:', uploadErr)
          }
        }

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
        // Uniquement si le message correspond exactement au pre_filled_message d'un lien
        if (!fromMe && !conversation.ai_agent_id && content) {
          const { data: matchingLink } = await supabase
            .from('wa_links')
            .select('id, ai_agent_id')
            .eq('session_id', session.id)
            .eq('is_active', true)
            .not('ai_agent_id', 'is', null)
            .eq('pre_filled_message', content)
            .limit(1)
            .maybeSingle()

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

            // Notification: agent a commencé à gérer une conversation
            const { data: agentInfo } = await supabase
              .from('ai_agents')
              .select('name')
              .eq('id', matchingLink.ai_agent_id)
              .single()

            await supabase.from('user_alerts').insert({
              user_id: session.user_id,
              alert_type: 'agent_started',
              title: 'Agent IA activé',
              message: `L'agent "${agentInfo?.name || 'IA'}" a commencé à gérer une nouvelle conversation avec +${contact.phone_number}`,
              metadata: {
                conversation_id: conversation.id,
                session_id: session.id,
                agent_id: matchingLink.ai_agent_id,
                contact_phone: contact.phone_number,
                wa_link_id: matchingLink.id,
              },
            })
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

        // 3. Insérer le message (dédupliqué via wa_message_id)
        // Chiffrer le contenu du message si la clé est configurée
        const encryptedContent = content ? encryptMessage(content) : ''

        // Vérifier si le message existe déjà (reconnexion = messages historiques renvoyés)
        if (waMessageId) {
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', waMessageId)
            .maybeSingle()
          if (existing) {
            console.log(`[Webhook] Message already exists, skipping: ${waMessageId}`)
            break
          }
        }

        // Insérer le message avec les champs média (fallback sans si colonnes absentes)
        let insertedMessage = null
        const baseInsert = {
          conversation_id: conversation.id,
          session_id: session.id,
          direction: fromMe ? 'outbound' : 'inbound',
          content: encryptedContent,
          message_type: messageType,
          media_url: storagePath,
          wa_message_id: waMessageId,
          sent_by: fromMe ? 'user' : 'contact',
          status: 'delivered',
          ai_processed: false,
        }

        const { data: msg, error: insertErr } = await supabase
          .from('messages')
          .insert({
            ...baseInsert,
            media_mime_type: mediaResult.mediaMimeType || null,
            transcription: mediaResult.transcription ? encryptMessage(mediaResult.transcription) : null,
          })
          .select()
          .single()

        if (insertErr) {
          // Fallback : insérer sans les nouvelles colonnes (migration pas encore appliquée)
          console.warn('[Webhook] Insert with media fields failed, retrying without:', insertErr.message)
          const { data: msgFallback } = await supabase
            .from('messages')
            .insert(baseInsert)
            .select()
            .single()
          insertedMessage = msgFallback
        } else {
          insertedMessage = msg
        }

        // 3b. Détection opt-out pour campagnes
        if (!fromMe && content && messageType === 'text') {
          // Charger les mots-clés opt-out depuis la base de données
          const { data: dbKeywords } = await supabase
            .from('campaign_opt_out_keywords')
            .select('keyword')

          const optOutKeywords = dbKeywords?.length
            ? dbKeywords.map(k => k.keyword)
            : DEFAULT_OPT_OUT_KEYWORDS

          const matchedKeyword = containsOptOutKeyword(content, optOutKeywords)

          if (matchedKeyword) {
            console.log(`[Webhook] Opt-out keyword detected: "${matchedKeyword}" from ${phoneNumber}`)

            // Ajouter à la blacklist (upsert pour éviter doublons)
            await supabase
              .from('campaign_blacklist')
              .upsert(
                {
                  user_id: session.user_id,
                  contact_id: contact.id,
                  session_id: session.id,
                  reason: 'opt_out',
                  keyword_matched: matchedKeyword,
                },
                { onConflict: 'user_id,contact_id' }
              )

            // Créer une alerte pour informer l'utilisateur
            await supabase.from('user_alerts').insert({
              user_id: session.user_id,
              alert_type: 'campaign_opt_out',
              title: 'Contact désabonné',
              message: `${contact.name || phoneNumber} s'est désabonné des campagnes (mot-clé: "${matchedKeyword}")`,
              metadata: {
                contact_id: contact.id,
                phone_number: phoneNumber,
                keyword: matchedKeyword,
                session_id: session.id
              },
            })

            console.log(`[Webhook] Contact ${contact.id} added to blacklist`)
          }
        }

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
            // Récupérer la config de l'agent (délai + limites + horaires)
            const { data: agentConfig } = await supabase
              .from('ai_agents')
              .select('response_delay_min, response_delay_max, max_messages_per_conversation, inactivity_timeout_minutes, schedule_enabled, schedule_timezone, schedule_start_time, schedule_end_time, schedule_days')
              .eq('id', convFresh.ai_agent_id)
              .single()

            // Vérification horaires d'activité
            if (agentConfig?.schedule_enabled) {
              const tz = agentConfig.schedule_timezone || 'Europe/Paris'
              const now = new Date()

              // Convertir en heure locale du fuseau horaire configuré
              const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                weekday: 'short',
              })
              const parts = formatter.formatToParts(now)
              const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
              const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
              const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon'

              // Convertir le jour de la semaine (Sun=0, Mon=1, ..., Sat=6)
              const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
              const currentDay = dayMap[weekdayStr] ?? 1

              // Vérifier si le jour actuel est dans les jours autorisés
              const allowedDays = agentConfig.schedule_days || [1, 2, 3, 4, 5]
              if (!allowedDays.includes(currentDay)) {
                console.log(`[Webhook] Skipping AI — outside schedule days (current: ${weekdayStr}, allowed: ${allowedDays.join(',')})`)
                break
              }

              // Vérifier si l'heure actuelle est dans la plage horaire
              const currentMinutes = hour * 60 + minute
              const [startH, startM] = (agentConfig.schedule_start_time || '09:00').split(':').map(Number)
              const [endH, endM] = (agentConfig.schedule_end_time || '18:00').split(':').map(Number)
              const startMinutes = startH * 60 + startM
              const endMinutes = endH * 60 + endM

              if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
                console.log(`[Webhook] Skipping AI — outside schedule hours (current: ${hour}:${minute}, allowed: ${agentConfig.schedule_start_time}-${agentConfig.schedule_end_time} ${tz})`)
                break
              }
            }

            // Vérification limite : max messages par conversation
            if (agentConfig?.max_messages_per_conversation) {
              const { count } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('conversation_id', conversation.id)
              if (count != null && count >= agentConfig.max_messages_per_conversation) {
                console.log(`[Webhook] Skipping AI — max messages reached (${count}/${agentConfig.max_messages_per_conversation})`)
                break
              }
            }

            // Vérification limite : timeout d'inactivité
            if (agentConfig?.inactivity_timeout_minutes) {
              const { data: prevMessages } = await supabase
                .from('messages')
                .select('created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(2)

              // Le premier message est celui qu'on vient d'insérer, le second est le précédent
              if (prevMessages && prevMessages.length >= 2) {
                const previousMsgTime = new Date(prevMessages[1].created_at)
                const cutoff = new Date()
                cutoff.setMinutes(cutoff.getMinutes() - agentConfig.inactivity_timeout_minutes)
                if (previousMsgTime < cutoff) {
                  console.log(`[Webhook] Skipping AI — conversation inactive (last msg: ${previousMsgTime.toISOString()}, timeout: ${agentConfig.inactivity_timeout_minutes}min)`)
                  break
                }
              }
            }

            // Vérification limite : messages IA quotidiens par session
            if (session.daily_ai_message_limit != null) {
              const todayStart = new Date()
              todayStart.setHours(0, 0, 0, 0)

              const { count: dailyAiCount } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('session_id', session.id)
                .eq('sent_by', 'ai_agent')
                .gte('created_at', todayStart.toISOString())

              if (dailyAiCount != null && dailyAiCount >= session.daily_ai_message_limit) {
                console.log(`[Webhook] Skipping AI — daily session limit reached (${dailyAiCount}/${session.daily_ai_message_limit})`)

                // Créer une alerte quota atteint (une seule fois par jour)
                const todayStr = todayStart.toISOString().split('T')[0]
                const { data: existingAlert } = await supabase
                  .from('user_alerts')
                  .select('id')
                  .eq('user_id', session.user_id)
                  .eq('alert_type', 'quota_reached')
                  .gte('created_at', todayStart.toISOString())
                  .limit(1)
                  .maybeSingle()

                if (!existingAlert) {
                  await supabase.from('user_alerts').insert({
                    user_id: session.user_id,
                    alert_type: 'quota_reached',
                    title: 'Quota IA atteint',
                    message: `La session "${session.instance_name}" a atteint sa limite quotidienne de ${session.daily_ai_message_limit} messages IA.`,
                    metadata: { session_id: session.id, date: todayStr, limit: session.daily_ai_message_limit },
                  })
                }
                break
              }
            }

            const delayMin = agentConfig?.response_delay_min ?? 0
            const delayMax = agentConfig?.response_delay_max ?? 0
            const delay = delayMax > delayMin
              ? delayMin + Math.random() * (delayMax - delayMin)
              : delayMin

            if (delay > 0) {
              console.log(`[Webhook] Waiting ${delay.toFixed(1)}s (random debounce ${delayMin}-${delayMax}s)...`)

              // Activer l'indicateur de saisie pendant l'attente
              evolution.sendPresence(instanceName, phoneNumber, 'composing', Math.round(delay * 1000)).catch(() => {})

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
                evolution.sendPresence(instanceName, phoneNumber, 'paused').catch(() => {})
                break
              }
            }

            // Activer l'indicateur de saisie pendant la génération IA
            evolution.sendPresence(instanceName, phoneNumber, 'composing').catch(() => {})

            console.log('[Webhook] Triggering AI response...')
            await processAIResponse({
              conversationId: conversation.id,
              sessionId: session.id,
              instanceName: instanceName,
              contactPhoneNumber: phoneNumber,
              agentId: convFresh.ai_agent_id,
              session: {
                integration_type: (session.integration_type || 'evolution') as 'evolution' | 'waba',
                instance_name: session.instance_name,
                waba_phone_number_id: session.waba_phone_number_id || null,
                waba_access_token: session.waba_access_token || null,
              },
            })

            // Arrêter l'indicateur de saisie après l'envoi
            evolution.sendPresence(instanceName, phoneNumber, 'paused').catch(() => {})
            console.log('[Webhook] AI response done')
          }
        }

        break
      }
    }

    // Log webhook success
    await supabase.from('webhook_logs').insert({
      session_id: sessionId,
      event_type: event,
      instance_name: instanceName,
      payload,
      status: logStatus,
      error_message: logError,
      processing_time_ms: Date.now() - startTime,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    logStatus = 'error'
    logError = error instanceof Error ? error.message : 'Unknown error'

    // Try to log the error (best effort)
    try {
      await supabase.from('webhook_logs').insert({
        session_id: sessionId,
        event_type: 'unknown',
        instance_name: 'unknown',
        payload: null,
        status: logStatus,
        error_message: logError,
        processing_time_ms: Date.now() - startTime,
      })

      // Créer une alerte d'erreur webhook si on a une session
      if (sessionId) {
        const { data: sess } = await supabase
          .from('whatsapp_sessions')
          .select('user_id, instance_name')
          .eq('id', sessionId)
          .single()

        if (sess) {
          await supabase.from('user_alerts').insert({
            user_id: sess.user_id,
            alert_type: 'webhook_error',
            title: 'Erreur webhook',
            message: `Une erreur s'est produite lors du traitement d'un webhook pour "${sess.instance_name}": ${logError}`,
            metadata: { session_id: sessionId, error: logError },
          })
        }
      }
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json({ ok: true }) // Toujours 200 pour éviter les retries Evolution
  }
}
