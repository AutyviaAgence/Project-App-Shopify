import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { processAIResponse } from '@/lib/openai/process-ai-response'
import { withSessionDelay } from '@/lib/messaging/session-queue'
import { analyzeConversationLifecycle } from '@/lib/openai/lifecycle-analyzer'
import { processWabaMediaMessage } from '@/lib/openai/media-processor'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { uploadMedia } from '@/lib/storage/media'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { recordTokenUsage } from '@/lib/openai/token-tracker'
import { checkRateLimit } from '@/lib/rate-limit'

const VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN

/**
 * GET /api/webhook/waba
 * Vérification du webhook Meta (challenge/verify_token)
 */
export async function GET(req: NextRequest) {
  if (!VERIFY_TOKEN) {
    console.error('[WABA Webhook] WABA_VERIFY_TOKEN not configured')
    return new Response('Server misconfigured', { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WABA Webhook] Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * Validate Meta webhook signature (X-Hub-Signature-256)
 * Returns the raw body if valid, null if invalid
 */
async function validateWebhookSignature(req: NextRequest): Promise<{ valid: boolean; body: string }> {
  const appSecret = process.env.WABA_APP_SECRET
  if (!appSecret) {
    console.error('[WABA Webhook] WABA_APP_SECRET is not configured — rejecting request (fail-closed)')
    return { valid: false, body: '' }
  }

  const signature = req.headers.get('x-hub-signature-256')
  if (!signature) return { valid: false, body: '' }

  const body = await req.text()
  const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex')
  // Use timing-safe comparison to prevent timing oracle attacks
  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSig)
  const valid = sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
  return { valid, body }
}

/**
 * POST /api/webhook/waba
 * Réception des messages entrants via WhatsApp Cloud API
 * Validates X-Hub-Signature-256 from Meta if WABA_APP_SECRET is configured
 */
export async function POST(req: NextRequest) {
  // Validate Meta webhook signature
  const sigResult = await validateWebhookSignature(req)
  if (!sigResult.valid) {
    console.warn('[WABA Webhook] Invalid or missing X-Hub-Signature-256')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = checkRateLimit(req, 'WEBHOOK')
  if (rateLimitResponse) return rateLimitResponse

  const startTime = Date.now()
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // If signature validation read the body, parse it; otherwise read from request
    const payload = sigResult.body ? JSON.parse(sigResult.body) : await req.json()

    // Meta envoie un objet avec entry[].changes[].value
    const entries = payload.entry as Array<{
      id: string
      changes: Array<{
        value: {
          messaging_product: string
          metadata: { display_phone_number: string; phone_number_id: string }
          contacts?: Array<{ profile: { name: string }; wa_id: string }>
          messages?: Array<{
            from: string
            id: string
            timestamp: string
            type: string
            text?: { body: string }
            image?: { id: string; mime_type: string; caption?: string }
            audio?: { id: string; mime_type: string }
            video?: { id: string; mime_type: string; caption?: string }
            document?: { id: string; mime_type: string; filename?: string; caption?: string }
            sticker?: { id: string; mime_type: string }
          }>
          statuses?: Array<{
            id: string
            status: string
            timestamp: string
            recipient_id: string
          }>
        }
        field: string
      }>
    }>

    if (!entries?.length) {
      return NextResponse.json({ ok: true })
    }

    for (const entry of entries) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId = value.metadata?.phone_number_id

        if (!phoneNumberId) continue

        // Trouver la session WABA correspondante
        const { data: session } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('integration_type', 'waba')
          .eq('waba_phone_number_id', phoneNumberId)
          .single()

        if (!session) {
          console.warn('[WABA Webhook] No session found for phone_number_id:', phoneNumberId)
          continue
        }

        // Decrypt waba_access_token if encrypted
        if (session.waba_access_token) {
          session.waba_access_token = decryptMessage(session.waba_access_token)
        }

        // Traiter les statuts de messages (delivered, read, etc.)
        if (value.statuses) {
          for (const status of value.statuses) {
            const waStatus = status.status === 'delivered' ? 'delivered'
              : status.status === 'read' ? 'read'
              : status.status === 'sent' ? 'sent'
              : null

            if (waStatus) {
              await supabase
                .from('messages')
                .update({ status: waStatus })
                .eq('wa_message_id', status.id)
            }
          }
        }

        // Traiter les messages entrants
        if (value.messages) {
          for (const msg of value.messages) {
            const phoneNumber: string = msg.from
            const waMessageId: string = msg.id
            const contactProfile = value.contacts?.find(c => c.wa_id === phoneNumber)
            const pushName = contactProfile?.profile?.name || null

            // Déterminer le type et contenu du message
            let content = ''
            let messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' = 'text'
            let transcriptionText: string | null = null
            let storagePath: string | null = null
            let mediaMimeType: string | null = null

            const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'] as const
            if (msg.type === 'text') {
              content = msg.text?.body || ''
              messageType = 'text'
            } else if (mediaTypes.includes(msg.type as typeof mediaTypes[number])) {
              messageType = msg.type as typeof mediaTypes[number]
              const mediaObj = msg[msg.type as keyof typeof msg] as { id?: string; caption?: string; filename?: string } | undefined
              const mediaId = mediaObj?.id

              console.log(`[WABA Webhook] Media type: ${msg.type}, mediaId: ${mediaId}, hasToken: ${!!session.waba_access_token}`)

              if (mediaId && session.waba_access_token) {
                // Étape 1 : Télécharger le média via Meta Graph API
                const downloadResult = await wabaClient.downloadMedia(mediaId, session.waba_access_token)

                if (downloadResult.ok) {
                  mediaMimeType = downloadResult.mimeType

                  // Étape 2 : Upload IMMÉDIAT dans Supabase Storage (avant transcription)
                  if (waMessageId) {
                    try {
                      const uploadResult = await uploadMedia({
                        sessionId: session.id,
                        messageId: waMessageId,
                        buffer: downloadResult.buffer,
                        mimeType: downloadResult.mimeType || 'application/octet-stream',
                      })
                      if (uploadResult.ok) {
                        storagePath = uploadResult.storagePath
                      } else {
                        console.warn('[WABA Webhook] Media upload failed:', uploadResult.error)
                      }
                    } catch (uploadErr) {
                      console.error('[WABA Webhook] Media upload error:', uploadErr)
                    }
                  }

                  // Étape 3 : Transcription IA (optionnelle, ne bloque pas le stockage)
                  const mediaResult = await processWabaMediaMessage(
                    messageType as 'image' | 'audio' | 'video' | 'document' | 'sticker',
                    mediaId,
                    session.waba_access_token,
                    mediaObj?.caption,
                    (mediaObj as { filename?: string })?.filename
                  )
                  content = mediaResult.content
                  messageType = mediaResult.messageType as typeof messageType
                  transcriptionText = mediaResult.transcription

                  // Enregistrer les tokens utilisés
                  if (mediaResult.tokensUsed > 0 && session.user_id) {
                    recordTokenUsage(session.user_id, mediaResult.tokensUsed).catch(err =>
                      console.error('[WABA Webhook] Token recording error:', err)
                    )
                  }
                } else {
                  console.warn('[WABA Webhook] Media download failed:', downloadResult.error)
                  content = mediaObj?.caption || `[${msg.type}]`
                }
              } else {
                console.warn(`[WABA Webhook] No mediaId or no access_token, fallback to [${msg.type}]`)
                content = mediaObj?.caption || `[${msg.type}]`
              }
            } else {
              content = `[${msg.type}]`
            }

            if (!content) continue

            // Aperçu adapté au type
            const previewContent = messageType === 'text'
              ? content.slice(0, 100)
              : messageType === 'audio' ? 'Message vocal'
              : messageType === 'image' ? 'Photo'
              : messageType === 'video' ? 'Vidéo'
              : messageType === 'document' ? 'Document'
              : messageType === 'sticker' ? 'Sticker'
              : content.slice(0, 100)

            // 1. Upsert contact
            const { data: contact } = await supabase
              .from('contacts')
              .upsert(
                {
                  session_id: session.id,
                  phone_number: phoneNumber,
                  name: pushName,
                },
                { onConflict: 'session_id,phone_number' }
              )
              .select()
              .single()

            if (!contact) continue

            if (pushName && !contact.name) {
              await supabase
                .from('contacts')
                .update({ name: pushName })
                .eq('id', contact.id)
            }

            // 1.5 Opt-in / opt-out (consentement WhatsApp)
            // Détection STOP → opt-out ; sinon, message entrant = opt-in implicite.
            const normalized = messageType === 'text'
              ? content.trim().toLowerCase().replace(/[^a-zàâäéèêëïîôöùûüç ]/gi, '').trim()
              : ''
            const STOP_WORDS = ['stop', 'stopp', 'desabonner', 'desabonnement', 'unsubscribe', 'arreter', 'arret']
            const isStop = STOP_WORDS.includes(normalized)
            const c = contact as typeof contact & { opt_in_status?: string }

            if (isStop) {
              await supabase
                .from('contacts')
                .update({ opt_in_status: 'opted_out', opt_out_at: new Date().toISOString() })
                .eq('id', contact.id)
            } else if (c.opt_in_status !== 'subscribed' && c.opt_in_status !== 'opted_out') {
              // Opt-in implicite : le contact a initié/poursuivi le contact
              await supabase
                .from('contacts')
                .update({
                  opt_in_status: 'subscribed',
                  opt_in_source: 'inbound_message',
                  opt_in_at: new Date().toISOString(),
                })
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

            if (!conversation) continue

            // Incrémenter unread (atomique via RPC pour éviter race conditions)
            const { error: rpcErr } = await supabase.rpc('increment_unread_count', {
              p_conversation_id: conversation.id,
              p_last_message_at: new Date().toISOString(),
              p_last_message_preview: previewContent,
            })
            if (rpcErr) {
              // Fallback si RPC pas encore déployée
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
            const encryptedContent = content ? encryptMessage(content) : ''

            // Vérifier si le message existe déjà pour CETTE session (Meta peut renvoyer le même message)
            if (waMessageId) {
              const { data: existing } = await supabase
                .from('messages')
                .select('id')
                .eq('wa_message_id', waMessageId)
                .eq('session_id', session.id)
                .maybeSingle()
              if (existing) {
                console.log(`[WABA Webhook] Message already exists, skipping: ${waMessageId}`)
                continue
              }
            }

            // Insérer le message avec les champs média (fallback sans si colonnes absentes)
            let insertedMessage = null
            const baseInsert = {
              conversation_id: conversation.id,
              session_id: session.id,
              direction: 'inbound' as const,
              content: encryptedContent,
              message_type: messageType,
              media_url: storagePath,
              wa_message_id: waMessageId,
              sent_by: 'contact' as const,
              status: 'delivered',
              ai_processed: false,
            }

            const { data: insertedMsg, error: insertErr } = await supabase
              .from('messages')
              .insert({
                ...baseInsert,
                media_mime_type: mediaMimeType,
                transcription: transcriptionText ? encryptMessage(transcriptionText) : null,
              })
              .select()
              .single()

            if (insertErr) {
              // Fallback : insérer sans les nouvelles colonnes (migration pas encore appliquée)
              console.warn('[WABA Webhook] Insert with media fields failed, retrying without:', insertErr.message)
              const { data: fallbackMsg } = await supabase
                .from('messages')
                .insert(baseInsert)
                .select()
                .single()
              insertedMessage = fallbackMsg
            } else {
              insertedMessage = insertedMsg
            }

            // 3b. Lifecycle auto-trigger (non-bloquant)
            {
              const newCount = (conversation.lifecycle_messages_since_analysis || 0) + 1
              await supabase
                .from('conversations')
                .update({ lifecycle_messages_since_analysis: newCount })
                .eq('id', conversation.id)

              const { data: userProfile } = await supabase
                .from('profiles')
                .select('lifecycle_analysis_threshold')
                .eq('id', session.user_id)
                .single()

              const threshold = userProfile?.lifecycle_analysis_threshold
              if (threshold && threshold > 0 && newCount >= threshold) {
                analyzeConversationLifecycle(conversation.id, session.user_id).catch((err) =>
                  console.error('[WABA Webhook] Lifecycle analysis error:', err)
                )
              }
            }

            // 4. Auto-réponse IA
            const { data: convFresh } = await supabase
              .from('conversations')
              .select('is_ai_active, ai_agent_id')
              .eq('id', conversation.id)
              .single()

            if (convFresh?.is_ai_active && convFresh?.ai_agent_id) {
              console.log('[WABA Webhook] Triggering AI response...')
              const sessionDelay = session.ai_message_delay ?? 0
              await withSessionDelay(session.id, sessionDelay, () =>
                processAIResponse({
                  conversationId: conversation.id,
                  sessionId: session.id,
                  instanceName: session.instance_name,
                  contactPhoneNumber: phoneNumber,
                  agentId: convFresh.ai_agent_id,
                  session: {
                    integration_type: 'waba',
                    instance_name: session.instance_name,
                    waba_phone_number_id: session.waba_phone_number_id,
                    waba_access_token: session.waba_access_token,
                  },
                })
              )
            }
          }
        }

        // Log webhook
        await supabase.from('webhook_logs').insert({
          session_id: session.id,
          event_type: 'waba_messages',
          instance_name: session.instance_name,
          payload: value,
          status: 'success',
          processing_time_ms: Date.now() - startTime,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[WABA Webhook] Error:', error)
    return NextResponse.json({ ok: true }) // Toujours 200 pour éviter les retries Meta
  }
}
