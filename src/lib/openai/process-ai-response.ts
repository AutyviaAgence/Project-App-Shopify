import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from './client'
import { checkTokenLimit, recordTokenUsage } from './token-tracker'
import { sendMessage, sendMediaMessage, sendPresence } from '@/lib/messaging/send'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'
import { SHOPIFY_ACTION_TOOLS, isShopifyActionTool, handleActionTool, userHasShopifyStore, NOTIFICATION_CHANNEL_TOOL, isNotificationChannelTool, handleNotificationChannelTool } from '@/lib/shopify/ai-tools'
import { checkConversationQuota } from '@/lib/shopify/plans'
import type { WhatsAppSession } from '@/types/database'

const MAX_CONTEXT_MESSAGES = 50

/**
 * Traite une réponse IA automatique pour un message entrant.
 * Conçu pour être appelé en fire-and-forget depuis le webhook.
 * Gère ses propres erreurs en interne (ne throw jamais).
 */
export async function processAIResponse(params: {
  conversationId: string
  sessionId: string
  instanceName: string
  contactPhoneNumber: string
  agentId: string
  session?: Pick<WhatsAppSession, 'integration_type' | 'instance_name' | 'waba_phone_number_id' | 'waba_access_token'>
}) {
  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Récupérer la config de l'agent
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', params.agentId)
      .eq('is_active', true)
      .single()

    if (!agent) {
      console.warn('[AI] Agent introuvable ou inactif:', params.agentId)
      return
    }

    console.log('[AI] Agent trouvé:', agent.name, '| model:', agent.model)

    // 1.1. Récupérer la session complète pour les tokens + intégration
    const { data: sessionForTokens } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, integration_type, instance_name, waba_phone_number_id, waba_access_token')
      .eq('id', params.sessionId)
      .single()

    const userId = sessionForTokens?.user_id
    // Utiliser la session passée en paramètre ou celle récupérée de la DB
    const sessionCtx = params.session || (sessionForTokens ? {
      integration_type: 'waba' as const,
      instance_name: sessionForTokens.instance_name || params.instanceName,
      waba_phone_number_id: sessionForTokens.waba_phone_number_id,
      waba_access_token: sessionForTokens.waba_access_token,
    } : {
      integration_type: 'waba' as const,
      instance_name: params.instanceName,
      waba_phone_number_id: null,
      waba_access_token: null,
    })
    if (userId) {
      const tokenCheck = await checkTokenLimit(userId)
      if (!tokenCheck.allowed) {
        console.log('[AI] Limite de tokens atteinte pour user:', userId, `(${tokenCheck.used}/${tokenCheck.limit})`)
        // Envoyer un message de notification au contact
        await sendMessage(
          sessionCtx,
          params.contactPhoneNumber,
          "Désolé, notre assistant IA est temporairement indisponible. Veuillez réessayer plus tard ou contacter directement notre équipe."
        )
        return
      }

      // Garde-fou quota de conversations (plan free : 10/mois). L'IA s'arrête
      // au-delà et l'utilisateur est invité à upgrader (alerte in-app).
      const quota = await checkConversationQuota(userId)
      if (!quota.allowed) {
        console.log(`[AI] Quota conversations atteint (${quota.used}/${quota.limit}, plan ${quota.plan}) — IA stoppée pour user:`, userId)
        await supabase.from('user_alerts').insert({
          user_id: userId,
          alert_type: 'quota_reached',
          title: 'Quota de conversations atteint',
          message: `Vous avez atteint ${quota.limit} conversations IA ce mois-ci (plan ${quota.plan}). Passez à un plan supérieur pour continuer à répondre automatiquement.`,
          metadata: { used: quota.used, limit: quota.limit, plan: quota.plan },
        }).then(() => {}, () => {})
        return
      }
    }

    let totalTokensUsed = 0

    // 1.5. Vérifier l'escalation (garde-fou) sur le dernier message entrant
    if (agent.escalation_enabled) {
      // Récupérer le dernier message entrant
      const { data: lastInbound } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', params.conversationId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastInbound?.content) {
        const messageText = decryptMessage(lastInbound.content).toLowerCase()
        const escalationMode = agent.escalation_mode || 'keywords'
        let escalationTriggered = false
        let escalationReason = ''

        // Mode 1: Keywords (exact match)
        if ((escalationMode === 'keywords' || escalationMode === 'both') && agent.escalation_keywords?.length > 0) {
          const triggeredKeyword = (agent.escalation_keywords as string[]).find((kw: string) =>
            messageText.includes(kw.toLowerCase())
          )
          if (triggeredKeyword) {
            escalationTriggered = true
            escalationReason = `Mot-clé: "${triggeredKeyword}"`
          }
        }

        // Mode 2: AI detection
        if (!escalationTriggered && (escalationMode === 'ai' || escalationMode === 'both')) {
          const aiCheck = await generateAgentResponse({
            model: 'gpt-4o-mini',
            temperature: 0,
            systemPrompt: `Tu es un détecteur de messages problématiques. Analyse le message d'un contact et détermine s'il contient :
- Des insultes ou injures (même en argot, verlan, abrégé)
- Un ton agressif ou menaçant
- Des menaces légales ou physiques
- Du harcèlement
- Une demande explicite de parler à un humain

Réponds UNIQUEMENT par "OUI:raison" si le message est problématique, ou "NON" sinon.
Exemples :
- "t'es un con" → OUI:insulte
- "je vais porter plainte" → OUI:menace légale
- "fdp" → OUI:insulte
- "passez-moi un responsable" → OUI:demande humain
- "bonjour je voudrais un renseignement" → NON
- "c nul votre truc" → OUI:insulte
- "merci beaucoup" → NON`,
            messages: [{ role: 'user', content: messageText }],
          })

          if (aiCheck.ok) {
            totalTokensUsed += aiCheck.tokensUsed
            const response = aiCheck.content?.trim() || ''
            if (response.toUpperCase().startsWith('OUI')) {
              escalationTriggered = true
              escalationReason = `IA: ${response.slice(4).trim() || 'message problématique détecté'}`
            }
          }
        }

        if (escalationTriggered) {
          console.log('[AI] ESCALATION détectée!', escalationReason)

          // Envoyer le message d'escalation si configuré
          if (agent.escalation_message) {
            await sendMessage(
              sessionCtx,
              params.contactPhoneNumber,
              agent.escalation_message
            )

            // Sauvegarder le message d'escalation
            await supabase.from('messages').insert({
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              direction: 'outbound',
              content: encryptMessage(agent.escalation_message),
              message_type: 'text',
              sent_by: 'ai_agent',
              ai_agent_id: params.agentId,
              status: 'sent',
            })
          }

          // Désactiver l'IA pour cette conversation et enregistrer l'escalation
          await supabase
            .from('conversations')
            .update({
              is_ai_active: false,
              escalation_reason: escalationReason,
              escalated_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
              last_message_preview: agent.escalation_message?.slice(0, 100) || 'Escalation automatique',
            })
            .eq('id', params.conversationId)

          // Créer une alerte pour l'utilisateur
          const { data: session } = await supabase
            .from('whatsapp_sessions')
            .select('user_id, instance_name')
            .eq('id', params.sessionId)
            .single()

          if (session) {
            await supabase.from('user_alerts').insert({
              user_id: session.user_id,
              alert_type: 'info',
              title: 'Escalation automatique',
              message: `Une conversation a été automatiquement transférée. Raison : ${escalationReason}. L'IA a été désactivée.`,
              metadata: {
                conversation_id: params.conversationId,
                session_id: params.sessionId,
                reason: escalationReason,
                agent_id: params.agentId,
                mode: escalationMode,
              },
            })
          }

          console.log('[AI] Conversation escaladée, IA désactivée')
          // Enregistrer les tokens avant de return
          if (userId && totalTokensUsed > 0) {
            await recordTokenUsage(userId, totalTokensUsed)
          }
          return
        }
      }
    }

    // 2. Récupérer les N messages les plus récents (desc) puis remettre en ordre chrono
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, content, transcription, sent_by, direction, message_type, ai_processed, created_at')
      .eq('conversation_id', params.conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES)

    // 3. Remettre en ordre chronologique et construire les messages pour OpenAI
    // Déchiffrer les messages pour le contexte IA
    const sorted = (recentMessages || []).reverse()
    const chatMessages: ChatMessage[] = sorted
      .filter((m) => m.content || m.transcription)
      .map((m) => {
        let text = m.content ? decryptMessage(m.content) : ''
        // Ajouter la transcription au contexte pour les messages média
        if (m.transcription) {
          const transcriptionText = decryptMessage(m.transcription)
          text = text ? `${text}\n[Transcription: ${transcriptionText}]` : transcriptionText
        }
        return {
          role: m.sent_by === 'contact' ? ('user' as const) : ('assistant' as const),
          content: text,
        }
      })

    // 3.5. RAG : Récupérer le contexte pertinent de la base de connaissances
    let knowledgeContext = ''
    const lastUserMessage = chatMessages.filter(m => m.role === 'user').pop()
    if (lastUserMessage) {
      const ragResult = await retrieveContext({
        agentId: params.agentId,
        query: lastUserMessage.content,
        topK: 5,
        threshold: 0.35,
      })
      if (ragResult.ok && ragResult.context) {
        knowledgeContext = ragResult.context
        totalTokensUsed += ragResult.tokensUsed
        console.log('[AI] RAG contexte récupéré:', ragResult.chunks.length, 'chunks')
      } else if (!ragResult.ok) {
        console.warn('[AI] RAG erreur:', ragResult.error)
      }
    }

    // 4. Construire le prompt système (inclure l'objectif + connaissances si disponibles)
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Paris' })
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

    let systemPrompt = agent.system_prompt

    // 4.1. Détection automatique de langue — injectée EN PREMIER pour priorité maximale
    if (agent.auto_detect_language) {
      systemPrompt = `--- RÈGLE ABSOLUE DE LANGUE ---\nDétecte TOUJOURS la langue du dernier message de l'utilisateur et réponds OBLIGATOIREMENT dans cette même langue. Si l'utilisateur écrit en anglais → réponds en anglais. En espagnol → espagnol. En arabe → arabe. Cette règle prime sur tout le reste du prompt.\n--- FIN RÈGLE DE LANGUE ---\n\n` + systemPrompt
    }

    systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).\nUtilise TOUJOURS cette date comme référence. "Demain" = le jour suivant cette date. Pour les dates et heures dans les outils, utilise le format ISO 8601 avec timezone, par exemple : 2026-03-06T15:00:00+01:00.`
    systemPrompt += `\n\n--- Contexte de la conversation ---\nNuméro WhatsApp du client : ${params.contactPhoneNumber}\nATTENTION : Ce numéro est "${params.contactPhoneNumber}". Quand tu dois inclure le numéro WhatsApp dans un message ou une notification, écris EXACTEMENT "${params.contactPhoneNumber}" — jamais de crochets, jamais de placeholder.`
    if (agent.objective) {
      systemPrompt += `\n\nObjectif principal : ${agent.objective}`
    }
    if (knowledgeContext) {
      systemPrompt += `\n\n--- Base de connaissances (PRIORITAIRE) ---\nIMPORTANT : Avant d'appeler un outil, vérifie TOUJOURS si la réponse se trouve dans la base de connaissances ci-dessous. N'appelle un outil que si l'information n'est PAS disponible ici. Utilise ces informations en priorité pour répondre de manière précise.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
    }

    // Injecter les images disponibles si l'agent en a
    if (userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allUserImages } = await (supabase as any)
        .from('knowledge_images')
        .select('ref, filename, agent_id')
        .eq('user_id', userId) as { data: { ref: string; filename: string; agent_id: string | null }[] | null }
      const agentImages = (allUserImages || []).filter(img => img.agent_id === null || img.agent_id === params.agentId)
      if (agentImages.length > 0) {
        const imgList = agentImages.map(i => `- [IMAGE:${i.ref}] → ${i.filename}`).join('\n')
        systemPrompt += `\n\n--- Images disponibles (UTILISE-LES) ---\nQuand l'utilisateur demande une image ou que le contexte s'y prête, tu DOIS insérer la balise [IMAGE:ref] dans ta réponse. Le système enverra l'image automatiquement.\nImages disponibles :\n${imgList}\nRÈGLE : si l'utilisateur demande "l'image", "une image", ou un contenu visuel, insère IMMÉDIATEMENT la balise correspondante. Ne dis jamais que tu n'as pas d'image si une balise est listée ci-dessus.\nExemple : pour envoyer "menu-burger", écris [IMAGE:menu-burger] dans ta réponse.\n--- Fin des images ---`
      }
    }

    // 4.2. Lien de rendez-vous tracké
    if (agent.booking_url) {
      // Construire l'URL de tracking avec les paramètres de contexte
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const trackingUrl = new URL(`${baseUrl}/api/booking/${agent.id}`)
      trackingUrl.searchParams.set('conv', params.conversationId)
      trackingUrl.searchParams.set('session', params.sessionId)

      // Récupérer le contact_id depuis la conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', params.conversationId)
        .single()

      if (conv?.contact_id) {
        trackingUrl.searchParams.set('contact', conv.contact_id)
      }

      systemPrompt += `\n\n--- Lien de rendez-vous ---\nSi l'utilisateur souhaite prendre un rendez-vous, planifier un appel, ou réserver un créneau, partage ce lien :\n${trackingUrl.toString()}\nUtilise ce lien tel quel sans le modifier. Tu peux l'inclure naturellement dans ta réponse quand c'est pertinent.`
      console.log('[AI] Booking URL injectée')
    }

    console.log('[AI] Contexte:', chatMessages.length, 'messages', knowledgeContext ? '| RAG actif' : '| sans RAG', agent.auto_detect_language ? '| multi-langue' : '', agent.booking_url ? '| booking' : '', '| Appel OpenAI...')

    // 4.5. Envoyer l'indicateur "en train d'écrire" avant d'appeler OpenAI
    await sendPresence(sessionCtx, params.contactPhoneNumber, 'composing')

    // 4.7. Charger les outils de l'agent (function calling)
    const agentTools = await getAgentTools(params.agentId)
    const { openaiTools, functionMap } = buildOpenAITools(agentTools)

    // 4.7b. Outils d'action Shopify (annuler/rembourser/code promo) — proposés
    // uniquement si l'utilisateur a une boutique Shopify connectée. L'IA ne fait
    // que créer une action en attente ; un humain valide ensuite.
    if (userId && (await userHasShopifyStore(userId))) {
      openaiTools.push(...SHOPIFY_ACTION_TOOLS)
      openaiTools.push(NOTIFICATION_CHANNEL_TOOL)
    }

    if (openaiTools.length > 0) {
      console.log('[AI] Outils chargés:', openaiTools.length, 'fonctions')
      const toolNames = openaiTools.map(t => t.function.name).join(', ')
      systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données — appelle l'outil.\n--- Fin des outils ---`
    }

    // 5. Appeler OpenAI (avec boucle tool calling si outils disponibles)
    const MAX_TOOL_ROUNDS = 10
    const toolMessages: OpenAIMessage[] = []
    let aiResponseText = ''

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await generateAgentResponse({
        model: agent.model,
        temperature: agent.temperature,
        systemPrompt,
        messages: [...chatMessages, ...toolMessages],
        tools: openaiTools.length > 0 ? openaiTools : undefined,
      })

      if (!result.ok) {
        console.error('[AI] Erreur OpenAI:', result.error)
        return
      }

      totalTokensUsed += result.tokensUsed

      // If no tool calls, we have our final response
      if (!result.toolCalls) {
        aiResponseText = result.content
        break
      }

      // Process tool calls
      console.log('[AI] Tool calls reçus:', result.toolCalls.length)

      // Add the assistant message with tool_calls (native OpenAI format)
      toolMessages.push(result.rawMessage as OpenAIMessage)

      for (const tc of result.toolCalls) {
        // Outils d'action Shopify : créer une action en attente (pas d'exécution).
        if (isShopifyActionTool(tc.functionName)) {
          const actionMsg = await handleActionTool(
            { functionName: tc.functionName, arguments: tc.arguments },
            { userId: userId!, conversationId: params.conversationId }
          )
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: actionMsg })
          continue
        }

        // Opt-in canal de notification (le client choisit WhatsApp/Email).
        if (isNotificationChannelTool(tc.functionName)) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('contact_id')
            .eq('id', params.conversationId)
            .maybeSingle()
          const channelMsg = await handleNotificationChannelTool(tc.arguments, { contactId: conv?.contact_id })
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: channelMsg })
          continue
        }

        const mapping = functionMap.get(tc.functionName)
        if (!mapping) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.toolCallId,
            content: 'Error: Unknown function',
          })
          continue
        }

        const { tool, fn } = mapping
        console.log('[AI] Exécution outil:', tool.name, '→', fn.name, '| args:', JSON.stringify(tc.arguments))

        const execResult = await executeToolCall(tool, fn, tc.arguments, {
          userId: userId!,
          agentId: params.agentId,
          conversationId: params.conversationId,
        })

        console.log('[AI] Résultat outil:', execResult.success ? 'OK' : 'ERREUR', `(${execResult.durationMs}ms)`)

        // Add tool result with proper "tool" role and tool_call_id
        toolMessages.push({
          role: 'tool',
          tool_call_id: tc.toolCallId,
          content: execResult.result,
        })
      }

      // Refresh typing indicator between rounds
      await sendPresence(sessionCtx, params.contactPhoneNumber, 'composing')
    }

    if (!aiResponseText) {
      console.error('[AI] Pas de réponse après', MAX_TOOL_ROUNDS, 'rounds de tool calling')
      return
    }

    console.log('[AI] Réponse OpenAI reçue:', aiResponseText.slice(0, 80) + '...')

    // 6. Détecter et envoyer les images [IMAGE:ref] avant le message texte
    const imageTagRegex = /\[IMAGE:([a-z0-9_-]+)\]/gi
    const imageRefs = [...aiResponseText.matchAll(imageTagRegex)].map(m => m[1])
    const textWithoutImages = aiResponseText.replace(imageTagRegex, '').replace(/\n{3,}/g, '\n\n').trim()

    if (imageRefs.length > 0) {
      // Récupérer les images depuis la DB (supabase = service_role, bypass RLS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let imgQuery = (supabase as any)
        .from('knowledge_images')
        .select('ref, storage_path, mime_type, filename')
        .in('ref', imageRefs)
      if (userId) imgQuery = imgQuery.eq('user_id', userId)
      const { data: knowledgeImages } = await imgQuery as { data: { ref: string; storage_path: string; mime_type: string; filename: string }[] | null }

      for (const ref of imageRefs) {
        const imgRecord = knowledgeImages?.find(i => i.ref === ref)
        if (!imgRecord) {
          console.warn('[AI] Image ref introuvable:', ref)
          continue
        }
        try {
          const { data: fileData, error: dlError } = await supabase.storage
            .from('knowledge-images')
            .download(imgRecord.storage_path)
          if (dlError || !fileData) {
            console.warn('[AI] Image download failed:', ref, dlError?.message)
            continue
          }
          const buffer = Buffer.from(await fileData.arrayBuffer())
          const sendImgResult = await sendMediaMessage(sessionCtx, params.contactPhoneNumber, {
            mediatype: 'image',
            buffer,
            mimetype: imgRecord.mime_type,
            fileName: imgRecord.filename,
          })
          if (!sendImgResult.ok) console.warn('[AI] Image send failed:', ref, sendImgResult.error)
          else {
            await supabase.from('messages').insert({
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              direction: 'outbound',
              content: encryptMessage(imgRecord.filename),
              message_type: 'image',
              media_url: `knowledge-images:${imgRecord.storage_path}`,
              media_mime_type: imgRecord.mime_type,
              sent_by: 'ai_agent',
              ai_agent_id: params.agentId,
              status: 'sent',
            })
          }
        } catch (imgErr) {
          console.warn('[AI] Image error for ref:', ref, imgErr)
        }
      }
    }

    // Envoyer le texte (sans les tags [IMAGE:...])
    const finalText = textWithoutImages

    // 6. Envoyer le texte uniquement s'il est non vide (si réponse = image seule, pas de texte)
    let sendResult: { ok: boolean; error?: string } = { ok: true }
    let savedMessage: { id: string } | null = null
    if (finalText) {
      sendResult = await sendMessage(
        sessionCtx,
        params.contactPhoneNumber,
        finalText
      )

      if (!sendResult.ok) {
        console.error('[AI] Erreur envoi message:', sendResult.error)
      }

      // 7. Sauvegarder le message IA en BDD (chiffré si clé configurée)
      const { data: saved } = await supabase.from('messages').insert({
        conversation_id: params.conversationId,
        session_id: params.sessionId,
        direction: 'outbound',
        content: encryptMessage(finalText),
        message_type: 'text',
        sent_by: 'ai_agent',
        ai_agent_id: params.agentId,
        status: sendResult.ok ? 'sent' : 'failed',
      }).select('id').single()
      savedMessage = saved
    }

    // 7.1 Tracker si l'agent a proposé un lien de RDV dans sa réponse
    if (agent.booking_url) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const bookingLinkPattern = `${baseUrl}/api/booking/${agent.id}`

      if (finalText.includes(bookingLinkPattern)) {
        // Récupérer le contact_id depuis la conversation
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id')
          .eq('id', params.conversationId)
          .single()

        // Enregistrer la proposition de RDV
        await supabase.from('booking_proposals').insert({
          agent_id: params.agentId,
          conversation_id: params.conversationId,
          contact_id: conv?.contact_id || null,
          session_id: params.sessionId,
          message_id: savedMessage?.id || null,
        })
        console.log('[AI] Proposition de RDV trackée pour agent:', agent.name)
      }
    }

    // 7.2 Vérifier la condition d'arrêt personnalisée
    if (agent.stop_condition) {
      const stopCheckResult = await generateAgentResponse({
        model: 'gpt-4o-mini',
        temperature: 0,
        systemPrompt: `Tu es un assistant qui vérifie si une condition d'arrêt est remplie.

Condition d'arrêt définie : "${agent.stop_condition}"

Analyse la dernière réponse de l'agent et détermine si la condition d'arrêt est remplie.
Réponds UNIQUEMENT par "OUI" si la condition est clairement remplie, ou "NON" sinon.
Sois strict : la condition doit être explicitement satisfaite.`,
        messages: [
          { role: 'user', content: `Dernière réponse de l'agent :\n\n${finalText}` },
        ],
      })

      if (stopCheckResult.ok) {
        totalTokensUsed += stopCheckResult.tokensUsed
      }

      if (stopCheckResult.ok && stopCheckResult.content?.trim().toUpperCase().startsWith('OUI')) {
        console.log('[AI] Condition d\'arrêt remplie:', agent.stop_condition)

        // Récupérer les infos de la session pour la notification
        const { data: session } = await supabase
          .from('whatsapp_sessions')
          .select('user_id, instance_name')
          .eq('id', params.sessionId)
          .single()

        // Désactiver l'IA pour cette conversation
        await supabase
          .from('conversations')
          .update({
            is_ai_active: false,
            last_message_at: new Date().toISOString(),
            last_message_preview: aiResponseText.slice(0, 100),
          })
          .eq('id', params.conversationId)

        // Créer une notification pour l'utilisateur
        if (session) {
          await supabase.from('user_alerts').insert({
            user_id: session.user_id,
            alert_type: 'agent_stopped',
            title: 'Agent arrêté automatiquement',
            message: `L'agent "${agent.name}" s'est arrêté car la condition a été remplie : "${agent.stop_condition}"`,
            metadata: {
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              agent_id: params.agentId,
              stop_condition: agent.stop_condition,
              reason: 'stop_condition_met',
            },
          })
        }

        console.log('[AI] Conversation arrêtée suite à la condition d\'arrêt')
        // Enregistrer les tokens avant de return
        if (userId && totalTokensUsed > 0) {
          await recordTokenUsage(userId, totalTokensUsed)
          console.log('[AI] Tokens enregistrés (stop):', totalTokensUsed)
        }
        return
      }
    }

    // 7.9. Enregistrer l'utilisation des tokens
    if (userId && totalTokensUsed > 0) {
      await recordTokenUsage(userId, totalTokensUsed)
      console.log('[AI] Tokens enregistrés:', totalTokensUsed)
    }

    // 8. Mettre à jour l'aperçu de la conversation
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: finalText.slice(0, 100),
      })
      .eq('id', params.conversationId)

    // 9. Marquer les messages inbound non traités comme traités
    await supabase
      .from('messages')
      .update({ ai_processed: true })
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .eq('ai_processed', false)

    console.log('[AI] Réponse envoyée pour conversation:', params.conversationId)
  } catch (err) {
    console.error('[AI] processAIResponse error:', err)
    // Ne jamais rethrow — c'est du fire-and-forget
  }
}
