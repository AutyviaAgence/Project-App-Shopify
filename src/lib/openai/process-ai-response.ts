import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from './client'
import { checkTokenLimit, recordTokenUsage } from './token-tracker'
import { sendMessage, sendPresence } from '@/lib/messaging/send'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'
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
  /** If true, exclude previous AI messages from context (used after qualifier handoff) */
  isHandoff?: boolean
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
      integration_type: (sessionForTokens.integration_type || 'evolution') as 'evolution' | 'waba',
      instance_name: sessionForTokens.instance_name || params.instanceName,
      waba_phone_number_id: sessionForTokens.waba_phone_number_id,
      waba_access_token: sessionForTokens.waba_access_token,
    } : {
      integration_type: 'evolution' as const,
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
    }

    let totalTokensUsed = 0

    // 1.5. Vérifier l'escalation (garde-fou) sur le dernier message entrant
    if (agent.escalation_enabled && agent.escalation_keywords?.length > 0) {
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
        const triggeredKeyword = (agent.escalation_keywords as string[]).find((kw: string) =>
          messageText.includes(kw.toLowerCase())
        )

        if (triggeredKeyword) {
          console.log('[AI] ESCALATION détectée! Mot-clé:', triggeredKeyword)

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
              escalation_reason: triggeredKeyword,
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
              message: `Une conversation a été automatiquement transférée car le mot-clé "${triggeredKeyword}" a été détecté. L'IA a été désactivée pour cette conversation.`,
              metadata: {
                conversation_id: params.conversationId,
                session_id: params.sessionId,
                keyword: triggeredKeyword,
                agent_id: params.agentId,
              },
            })
          }

          console.log('[AI] Conversation escaladée, IA désactivée')
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
    // After a qualifier handoff, only keep contact messages so the new agent starts fresh
    const filtered = params.isHandoff
      ? sorted.filter((m) => m.sent_by === 'contact')
      : sorted
    const chatMessages: ChatMessage[] = filtered
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
        threshold: 0.7,
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
    systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).\nUtilise TOUJOURS cette date comme référence. "Demain" = le jour suivant cette date. Pour les dates et heures dans les outils, utilise le format ISO 8601 avec timezone, par exemple : 2026-03-06T15:00:00+01:00.`
    if (agent.objective) {
      systemPrompt += `\n\nObjectif principal : ${agent.objective}`
    }
    if (knowledgeContext) {
      systemPrompt += `\n\n--- Base de connaissances ---\nUtilise les informations suivantes pour répondre de manière précise. Si l'information demandée ne se trouve pas dans la base de connaissances, dis-le honnêtement.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
    }

    // 4.1. Détection automatique de langue
    if (agent.auto_detect_language) {
      systemPrompt += `\n\n--- Instruction de langue ---\nIMPORTANT : Détecte automatiquement la langue utilisée par l'utilisateur dans son dernier message et réponds TOUJOURS dans cette même langue. Si l'utilisateur écrit en anglais, réponds en anglais. Si l'utilisateur écrit en espagnol, réponds en espagnol. Adapte-toi à la langue de chaque message.`
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

    // 4.6. Qualifier : injecter les routes de redirection dans le system prompt
    let qualifierRoutes: { id: string; target_agent_id: string; name: string; description: string }[] = []
    if (agent.agent_type === 'qualifier') {
      const { data: routes } = await supabase
        .from('qualifier_routes')
        .select('id, target_agent_id, name, description')
        .eq('agent_id', params.agentId)
        .eq('is_active', true)
        .order('priority', { ascending: true })

      qualifierRoutes = routes || []
      if (qualifierRoutes.length > 0) {
        const routesList = qualifierRoutes.map((r, i) => `${i + 1}. "${r.name}" — ${r.description}`).join('\n')
        systemPrompt += `\n\n--- Agent Qualificateur ---\nTu es un agent qualificateur. Ton rôle est d'analyser les messages entrants et de rediriger vers le bon agent spécialisé.\n\nScénarios de redirection disponibles :\n${routesList}\n\nQuand tu identifies avec certitude le scénario correspondant, utilise la fonction "route_to_agent" avec le nom exact du scénario.\nSi tu n'es pas sûr, pose des questions pour qualifier le besoin avant de rediriger.\nNe redirige JAMAIS sans être certain du scénario. Continue la conversation pour qualifier si nécessaire.\n--- Fin qualificateur ---`
      }
    }

    // 4.7. Charger les outils de l'agent (function calling)
    const agentTools = await getAgentTools(params.agentId)
    const { openaiTools, functionMap } = buildOpenAITools(agentTools)
    // Add qualifier route_to_agent tool if qualifier with routes
    if (agent.agent_type === 'qualifier' && qualifierRoutes.length > 0) {
      const routeNames = qualifierRoutes.map(r => r.name)
      openaiTools.push({
        type: 'function' as const,
        function: {
          name: 'route_to_agent',
          description: 'Redirige la conversation vers un agent spécialisé selon le scénario identifié. Utilise cette fonction UNIQUEMENT quand tu es certain du scénario.',
          parameters: {
            type: 'object',
            properties: {
              scenario_name: {
                type: 'string',
                description: `Le nom exact du scénario de redirection. Valeurs possibles : ${routeNames.map(n => `"${n}"`).join(', ')}`,
                enum: routeNames,
              },
            },
            required: ['scenario_name'],
          },
        },
      })
    }

    if (openaiTools.length > 0) {
      console.log('[AI] Outils chargés:', openaiTools.length, 'fonctions')
      const toolNames = openaiTools.map(t => t.function.name).join(', ')
      systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données — appelle l'outil.\n--- Fin des outils ---`
    }

    // 5. Appeler OpenAI (avec boucle tool calling si outils disponibles)
    const MAX_TOOL_ROUNDS = 5
    const toolMessages: OpenAIMessage[] = []
    let aiResponseText = ''
    let qualifierRouteTriggered: { routeName: string; targetAgentId: string } | null = null

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

      // Check for qualifier route_to_agent BEFORE adding messages to the loop
      if (agent.agent_type === 'qualifier') {
        const routeCall = result.toolCalls.find(tc => tc.functionName === 'route_to_agent')
        if (routeCall) {
          const args = routeCall.arguments as { scenario_name?: string }
          const matchedRoute = qualifierRoutes.find(r => r.name === args.scenario_name)
          if (matchedRoute) {
            console.log('[AI] Qualifier routing to:', matchedRoute.name, '→ agent:', matchedRoute.target_agent_id)
            qualifierRouteTriggered = { routeName: matchedRoute.name, targetAgentId: matchedRoute.target_agent_id }
            break // Sort de la boucle for-round immédiatement, pas de 2ème appel OpenAI
          }
        }
      }

      // Add the assistant message with tool_calls (native OpenAI format)
      toolMessages.push(result.rawMessage as OpenAIMessage)

      for (const tc of result.toolCalls) {
        // Skip route_to_agent (handled above before pushing to toolMessages)
        if (tc.functionName === 'route_to_agent') continue

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

      // Si handoff qualifier déclenché, sortir de la boucle immédiatement
      if (qualifierRouteTriggered) break

      // Refresh typing indicator between rounds
      await sendPresence(sessionCtx, params.contactPhoneNumber, 'composing')
    }

    if (!aiResponseText && !qualifierRouteTriggered) {
      console.error('[AI] Pas de réponse après', MAX_TOOL_ROUNDS, 'rounds de tool calling')
      return
    }

    console.log('[AI] Réponse OpenAI reçue:', aiResponseText.slice(0, 80) + '...')

    // 6.0 Qualifier silent handoff: si le qualifier redirige, ne PAS envoyer de message — l'agent cible répond directement
    if (qualifierRouteTriggered) {
      const { routeName, targetAgentId } = qualifierRouteTriggered

      // Vérifier que l'agent cible existe et est actif
      const { data: targetAgent } = await supabase
        .from('ai_agents')
        .select('id, name, is_active')
        .eq('id', targetAgentId)
        .single()

      if (targetAgent?.is_active) {
        // Basculer la conversation vers l'agent cible
        await supabase
          .from('conversations')
          .update({
            ai_agent_id: targetAgentId,
            is_ai_active: true,
          })
          .eq('id', params.conversationId)

        console.log(`[AI] Qualifier handoff: "${routeName}" → agent "${targetAgent.name}" (${targetAgentId})`)

        // Notification
        if (userId) {
          await supabase.from('user_alerts').insert({
            user_id: userId,
            alert_type: 'info',
            title: 'Qualification réussie',
            message: `Le qualificateur "${agent.name}" a redirigé une conversation vers l'agent "${targetAgent.name}" (scénario : ${routeName})`,
            metadata: {
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              qualifier_agent_id: params.agentId,
              target_agent_id: targetAgentId,
              route_name: routeName,
            },
          })
        }

        // Enregistrer les tokens du qualifier (pas d'envoi de message)
        if (userId && totalTokensUsed > 0) {
          await recordTokenUsage(userId, totalTokensUsed)
          console.log('[AI] Tokens enregistrés (qualifier handoff):', totalTokensUsed)
        }

        // Déclencher immédiatement l'agent cible — c'est LUI qui répond au contact, pas le qualifier
        console.log(`[AI] Qualifier silent handoff → agent "${targetAgent.name}" responds directly`)
        await processAIResponse({
          conversationId: params.conversationId,
          sessionId: params.sessionId,
          instanceName: params.instanceName,
          contactPhoneNumber: params.contactPhoneNumber,
          agentId: targetAgentId,
          session: params.session,
          isHandoff: true,
        })
        return
      } else {
        console.warn('[AI] Qualifier: agent cible introuvable ou inactif:', targetAgentId)
      }
    }

    // 6. Envoyer via l'intégration appropriée (Evolution ou WABA)
    const sendResult = await sendMessage(
      sessionCtx,
      params.contactPhoneNumber,
      aiResponseText
    )

    if (!sendResult.ok) {
      console.error('[AI] Erreur envoi message:', sendResult.error)
    }

    // 7. Sauvegarder le message IA en BDD (chiffré si clé configurée)
    const { data: savedMessage } = await supabase.from('messages').insert({
      conversation_id: params.conversationId,
      session_id: params.sessionId,
      direction: 'outbound',
      content: encryptMessage(aiResponseText),
      message_type: 'text',
      sent_by: 'ai_agent',
      ai_agent_id: params.agentId,
      status: sendResult.ok ? 'sent' : 'failed',
    }).select('id').single()

    // 7.1 Tracker si l'agent a proposé un lien de RDV dans sa réponse
    if (agent.booking_url) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const bookingLinkPattern = `${baseUrl}/api/booking/${agent.id}`

      if (aiResponseText.includes(bookingLinkPattern)) {
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
          { role: 'user', content: `Dernière réponse de l'agent :\n\n${aiResponseText}` },
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
        last_message_preview: aiResponseText.slice(0, 100),
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
