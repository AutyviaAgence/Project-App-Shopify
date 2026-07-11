import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { createHmac, timingSafeEqual } from 'crypto'
import { processAIResponse } from '@/lib/openai/process-ai-response'
import { withSessionDelay } from '@/lib/messaging/session-queue'
import { tryAcquire } from '@/lib/concurrency/semaphore'
import { enqueueAiJob } from '@/lib/ai-queue/enqueue'
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
    console.error('[WABA Webhook] WABA_APP_SECRET is not configured, rejecting request (fail-closed)')
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
  const supabase = getAdminSupabase()

  // Payload illisible → 200 : un retry Meta renverrait le même JSON cassé,
  // inutile. (Les erreurs de TRAITEMENT, elles, renvoient 500 → Meta renvoie.)
  let payload: { entry?: unknown }
  try {
    payload = sigResult.body ? JSON.parse(sigResult.body) : await req.json()
  } catch (err) {
    console.error('[WABA Webhook] Unparseable payload:', err)
    return NextResponse.json({ ok: true })
  }

  try {

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
          // Champs de surveillance qualité (structure différente de `messages`).
          display_phone_number?: string
          event?: string
          current_limit?: string
          message_template_id?: string
          message_template_name?: string
          message_template_language?: string
          reason?: string
        }
        field: string
      }>
    }>

    if (!entries?.length) {
      return NextResponse.json({ ok: true })
    }

    for (const entry of entries) {
      for (const change of entry.changes) {
        // ── Santé du numéro & statut des templates (surveillance qualité) ──
        // Ces champs n'ont PAS la structure `messages` : on les traite à part,
        // via le business account id (entry.id) qui identifie le WABA.
        if (change.field === 'phone_number_quality_update' || change.field === 'message_template_status_update') {
          try {
            await handleQualityChange(supabase, entry.id, change.field, change.value as unknown as Record<string, unknown>)
          } catch (e) {
            console.error('[WABA Webhook] quality change:', e)
          }
          continue
        }

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

            if (!waStatus) continue

            // Meta envoie le timestamp du statut en secondes Unix.
            const statusTs = status.timestamp
              ? new Date(Number(status.timestamp) * 1000).toISOString()
              : new Date().toISOString()

            if (waStatus === 'read') {
              // Pour l'accusé de lecture : on ne l'enregistre (et ne déclenche
              // l'automation `message_read`) QU'UNE FOIS. read_at IS NULL sert
              // de garde : le 2e « read » que Meta pourrait renvoyer n'écrit rien
              // et ne re-déclenche pas. On récupère la ligne pour connaître le
              // contact à notifier.
              const { data: updatedRows } = await supabase
                .from('messages')
                .update({ status: 'read', read_at: statusTs })
                .eq('wa_message_id', status.id)
                .is('read_at', null)
                .select('id, conversation_id')

              const row = updatedRows?.[0]
              if (row?.conversation_id && session.user_id) {
                // conversation → contact (les messages n'ont pas de contact_id)
                const { data: conv } = await supabase
                  .from('conversations')
                  .select('contact_id')
                  .eq('id', row.conversation_id)
                  .single()

                if (conv?.contact_id) {
                  // Test A/B : le contact a LU notre message → marque ses
                  // assignations comme "opened" (taux d'ouverture de l'entonnoir).
                  supabase
                    .from('ab_test_assignments')
                    .update({ opened: true, opened_at: statusTs })
                    .eq('contact_id', conv.contact_id)
                    .eq('opened', false)
                    .then(undefined, () => {})

                  const { data: readContact } = await supabase
                    .from('contacts')
                    .select('name')
                    .eq('id', conv.contact_id)
                    .single()

                  try {
                    const { enqueueAutomations } = await import('@/lib/automations/engine')
                    await enqueueAutomations({
                      userId: session.user_id,
                      event: 'message_read',
                      ctx: {
                        contactId: conv.contact_id,
                        variables: {
                          customer_first_name: (readContact?.name || '').split(' ')[0] || '',
                          customer_full_name: readContact?.name || '',
                        },
                        // idempotence : un message lu ne déclenche qu'une fois
                        dedupKey: `read:${status.id}`,
                      },
                    })
                  } catch (err) {
                    console.error('[WABA Webhook] message_read enqueue error:', err)
                  }
                }
              }
            } else {
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

            // Dédup EN TÊTE de boucle : si Meta renvoie un message déjà traité
            // (retry après timeout/erreur), on l'ignore AVANT tout travail coûteux
            // (transcription média, upserts, unread). Rend les retries Meta
            // totalement idempotents → on peut renvoyer 500 sur erreur sans risque.
            if (waMessageId) {
              const { data: existingMsg } = await supabase
                .from('messages')
                .select('id')
                .eq('wa_message_id', waMessageId)
                .eq('session_id', session.id)
                .maybeSingle()
              if (existingMsg) {
                console.log(`[WABA Webhook] Message already exists, skipping: ${waMessageId}`)
                continue
              }
            }

            // Déterminer le type et contenu du message
            let content = ''
            let messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' = 'text'
            let transcriptionText: string | null = null
            let storagePath: string | null = null
            let mediaMimeType: string | null = null
            // Clic sur un bouton "réponse rapide" (quick reply) : Meta n'envoie
            // pas de payload custom → on récupère le LIBELLÉ du bouton cliqué.
            let clickedButtonTitle: string | null = null

            const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'] as const
            if (msg.type === 'text') {
              content = msg.text?.body || ''
              messageType = 'text'
            } else if (msg.type === 'interactive' || msg.type === 'button') {
              // Deux formes possibles selon que le bouton vient d'un message
              // interactif ou d'un template :
              //   interactive.button_reply.title  (boutons interactifs)
              //   button.text                      (boutons de template / quick reply)
              const mAny = msg as unknown as {
                interactive?: {
                  button_reply?: { title?: string; id?: string }
                  list_reply?: { title?: string; id?: string }
                }
                button?: { text?: string; payload?: string }
              }
              clickedButtonTitle =
                mAny.interactive?.button_reply?.title
                || mAny.interactive?.list_reply?.title
                || mAny.button?.text
                || mAny.button?.payload
                || null
              content = clickedButtonTitle || '[bouton]'
              messageType = 'text' // stocké comme texte (le libellé) pour l'inbox
            } else if (msg.type === 'order') {
              // Panier WhatsApp : le client a ajouté des produits du catalogue et
              // envoyé une "commande" (pas encore payée). On résume le panier.
              const order = (msg as unknown as {
                order?: { catalog_id?: string; text?: string; product_items?: { product_retailer_id: string; quantity: number; item_price: number; currency: string }[] }
              }).order
              const items = order?.product_items || []
              const total = items.reduce((s, it) => s + (it.item_price || 0) * (it.quantity || 0), 0)
              const currency = items[0]?.currency || ''
              const lines = items.map((it) => `• ${it.quantity}× ${it.product_retailer_id} (${it.item_price} ${it.currency})`)
              content = `🛒 Panier WhatsApp (${items.length} article${items.length > 1 ? 's' : ''}, ${total.toFixed(2)} ${currency})\n${lines.join('\n')}${order?.text ? `\nNote: ${order.text}` : ''}`
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
            const c = contact as typeof contact & { opt_in_status?: string; preferred_channel?: string }

            if (isStop) {
              await supabase
                .from('contacts')
                .update({ opt_in_status: 'opted_out', opt_out_at: new Date().toISOString() })
                .eq('id', contact.id)
            } else if (c.opt_in_status !== 'opted_out') {
              // Message ENTRANT (hors STOP) = opt-in implicite ET preuve que le
              // canal WhatsApp est actif. On construit l'update de façon
              // idempotente :
              //  - opt_in_* seulement si le contact n'était pas déjà abonné ;
              //  - preferred_channel='whatsapp' dès qu'il vaut 'none'/vide (répare
              //    les contacts créés sans canal, sinon exclus de TOUS les envois).
              const patch: Record<string, unknown> = {}
              if (c.opt_in_status !== 'subscribed') {
                patch.opt_in_status = 'subscribed'
                patch.opt_in_source = 'inbound_message'
                patch.opt_in_at = new Date().toISOString()
              }
              if (c.preferred_channel === 'none' || !c.preferred_channel) {
                patch.preferred_channel = 'whatsapp'
              }
              if (Object.keys(patch).length > 0) {
                await supabase.from('contacts').update(patch).eq('id', contact.id)
              }
            }

            // 1.6 Langue du contact : si on ne la connaît pas encore (Shopify ne
            // l'a pas fournie), on l'estime depuis le texte du message. On
            // n'écrase JAMAIS une langue déjà connue (Shopify reste prioritaire).
            if (messageType === 'text' && content) {
              const cl = contact as typeof contact & { preferred_language?: string | null }
              if (!cl.preferred_language) {
                const { detectLanguage } = await import('@/lib/i18n/contact-language')
                const detected = detectLanguage(content)
                if (detected) {
                  await supabase
                    .from('contacts')
                    .update({ preferred_language: detected, language_source: 'conversation' })
                    .eq('id', contact.id)
                }
              }
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

            // Test A/B : le contact a répondu → marque ses assignations comme "responded".
            supabase
              .from('ab_test_assignments')
              .update({ responded: true, responded_at: new Date().toISOString() })
              .eq('contact_id', contact.id)
              .eq('responded', false)
              .then(undefined, () => {})

            // 2.5 Agent référent : si la conversation n'a pas encore d'agent IA
            // assigné, on lui attribue l'agent "par défaut" du compte (et on
            // active l'IA dessus). Permet à l'IA de répondre automatiquement sur
            // toute nouvelle conversation sans assignation manuelle.
            if (!conversation.ai_agent_id && session.user_id) {
              const { data: defaultAgent } = await supabase
                .from('ai_agents')
                .select('id')
                .eq('user_id', session.user_id)
                .eq('is_default', true)
                .eq('is_active', true)
                .maybeSingle()
              if (defaultAgent?.id) {
                await supabase
                  .from('conversations')
                  .update({ ai_agent_id: defaultAgent.id, is_ai_active: true })
                  .eq('id', conversation.id)
                conversation.ai_agent_id = defaultAgent.id
                ;(conversation as { is_ai_active?: boolean }).is_ai_active = true
              }
            }

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

            // 3. Insérer le message (la dédup wa_message_id est faite en tête de boucle)
            const encryptedContent = content ? encryptMessage(content) : ''

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

            // 3b-bis. FUNNEL À BOUTONS : si un job de campagne est PARQUÉ sur un
            // message à boutons pour ce contact, le clic le REPREND sur la
            // branche correspondante (priorité sur les automations button_clicked
            // indépendantes ci-dessous).
            let funnelResumed = false
            if (clickedButtonTitle) {
              try {
                const { resumeParkedFunnel } = await import('@/lib/automations/engine')
                funnelResumed = await resumeParkedFunnel(contact.id, clickedButtonTitle)
              } catch (err) {
                console.error('[WABA Webhook] resumeParkedFunnel error:', err)
              }
            }

            // 3c. Clic sur un bouton → déclenche les automations "button_clicked"
            // (libellé du bouton = filtre). Non-bloquant.
            let buttonAutomationEnqueued = false
            if (clickedButtonTitle && session.user_id) {
              try {
                const { enqueueAutomations } = await import('@/lib/automations/engine')
                const enq = await enqueueAutomations({
                  userId: session.user_id,
                  event: 'button_clicked',
                  ctx: {
                    contactId: contact.id,
                    buttonTitle: clickedButtonTitle,
                    variables: {
                      button_title: clickedButtonTitle,
                      customer_first_name: (contact.name || '').split(' ')[0] || '',
                      customer_full_name: contact.name || '',
                    },
                    // idempotence : un même clic (wa_message_id) ne déclenche qu'une fois
                    dedupKey: waMessageId || undefined,
                  },
                })
                // enqueueAutomations renvoie { queued: number } : > 0 = au moins
                // une automation button_clicked a matché ce clic.
                buttonAutomationEnqueued = (enq?.queued ?? 0) > 0
              } catch (err) {
                console.error('[WABA Webhook] button_clicked enqueue error:', err)
              }
            }

            // Un clic de bouton qui a DÉCLENCHÉ une action (reprise de funnel ou
            // automation button_clicked) ne doit PAS aussi faire répondre l'IA :
            // c'est une réponse structurée traitée par le workflow, pas une
            // question conversationnelle. Sinon l'agent répondait « Oui »/« Non ».
            const handledByWorkflow = !!clickedButtonTitle && (funnelResumed || buttonAutomationEnqueued)

            // 4. Auto-réponse IA
            const { data: convFresh } = await supabase
              .from('conversations')
              .select('is_ai_active, ai_agent_id')
              .eq('id', conversation.id)
              .single()

            if (convFresh?.is_ai_active && convFresh?.ai_agent_id && !handledByWorkflow) {
              // Backpressure : borne le nombre de réponses IA simultanées par
              // process. Sous le seuil → réponse inline (rapide). Au-dessus (burst)
              // → on enfile dans ai_jobs (drainé par le cron run-ai-jobs), et le
              // webhook rend son 200 sans attendre. Évite qu'un afflux de messages
              // sature le VPS (CPU + pool Postgres).
              const AI_MAX_INFLIGHT = Number(process.env.AI_MAX_INFLIGHT ?? 8)
              const release = tryAcquire('ai-reply', AI_MAX_INFLIGHT)

              if (release) {
                console.log('[WABA Webhook] Triggering AI response (inline)...')
                const sessionDelay = session.ai_message_delay ?? 0
                // Fire-and-forget : on N'AWAIT PAS → le webhook répond à Meta
                // immédiatement. Le slot est libéré dans le finally (succès ou échec).
                void withSessionDelay(session.id, sessionDelay, () =>
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
                  .catch((err) => console.error('[WABA Webhook] inline AI error:', err))
                  .finally(() => release())
              } else {
                // Gate pleine → on enfile (persistant, dédup sur wa_message_id).
                console.log('[WABA Webhook] AI gate full → enqueue ai_job')
                await enqueueAiJob({
                  conversationId: conversation.id,
                  sessionId: session.id,
                  agentId: convFresh.ai_agent_id,
                  contactPhone: phoneNumber,
                  instanceName: session.instance_name,
                  userId: session.user_id,
                  waMessageId: waMessageId || null,
                })
              }
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
    // Erreur de TRAITEMENT (DB indisponible, etc.) → 500 pour que Meta RENVOIE
    // le webhook au lieu de perdre le message. Sûr : la dédup wa_message_id en
    // tête de boucle rend les retries idempotents (les messages déjà insérés
    // sont ignorés, seuls les manqués sont traités).
    console.error('[WABA Webhook] Error:', error)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}

/**
 * Traite les webhooks de SURVEILLANCE (hors `messages`) :
 *  - phone_number_quality_update : qualité + palier du numéro
 *  - message_template_status_update : statut d'un template (APPROVED/PAUSED…)
 * Identifie le WABA par le business account id (entry.id).
 */
async function handleQualityChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  wabaId: string,
  field: string,
  value: Record<string, unknown>
) {
  // Session correspondant à ce WABA (business account id).
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, quality_rating, messaging_limit_tier, marketing_paused')
    .eq('integration_type', 'waba')
    .eq('waba_business_account_id', wabaId)
    .maybeSingle()
  if (!session) return

  if (field === 'phone_number_quality_update') {
    const { normalizeQualityEvent, applyQualityUpdate } = await import('@/lib/whatsapp/quality')
    const quality = normalizeQualityEvent(value.event as string | undefined)
    const tier = (value.current_limit as string | undefined) || null
    await applyQualityUpdate(supabase, session, { quality: quality || undefined, tier })
    return
  }

  if (field === 'message_template_status_update') {
    const status = String(value.event || '').toUpperCase()
    const name = value.message_template_name as string | undefined
    const lang = value.message_template_language as string | undefined
    if (!name) return

    // Statut local (approved / rejected / paused / disabled).
    const localStatus = status === 'APPROVED' ? 'approved'
      : status === 'REJECTED' ? 'rejected'
      : status === 'PAUSED' ? 'paused'
      : status === 'DISABLED' ? 'disabled'
      : status === 'PENDING' ? 'pending' : null
    if (!localStatus) return

    let q = supabase.from('whatsapp_templates').update({ status: localStatus }).eq('name', name)
    if (session.user_id) q = q.eq('user_id', session.user_id)
    if (lang) q = q.eq('language', lang)
    const { data: updated } = await q.select('id')

    // Si Meta met le template en pause/désactive : on met en pause les
    // automatisations qui l'utilisent (sinon elles échouent en boucle).
    if ((localStatus === 'paused' || localStatus === 'disabled') && Array.isArray(updated) && updated.length > 0) {
      const ids = updated.map((t: { id: string }) => t.id)
      await supabase.from('automations').update({ is_active: false }).in('template_id', ids)
      if (session.user_id) {
        await supabase.from('user_alerts').insert({
          user_id: session.user_id,
          alert_type: 'whatsapp_template_paused',
          title: localStatus === 'disabled' ? `Modèle désactivé par Meta : ${name}` : `Modèle mis en pause par Meta : ${name}`,
          message: `Meta a ${localStatus === 'disabled' ? 'désactivé' : 'mis en pause'} le modèle « ${name} »${value.reason ? ` (${value.reason})` : ''}. Les automatisations qui l'utilisent ont été désactivées pour éviter des envois en échec. Corrigez le modèle puis resoumettez-le.`,
          metadata: { template: name, status: localStatus, reason: value.reason || null },
        })
      }
    }
  }
}
