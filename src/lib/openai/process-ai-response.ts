import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage } from './client'
import { checkTokenLimit, recordTokenUsage } from './token-tracker'
import { evolution } from '@/lib/evolution/client'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'

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

    // 1.1. Récupérer le userId et vérifier la limite de tokens
    const { data: sessionForTokens } = await supabase
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('id', params.sessionId)
      .single()

    const userId = sessionForTokens?.user_id
    if (userId) {
      const tokenCheck = await checkTokenLimit(userId)
      if (!tokenCheck.allowed) {
        console.log('[AI] Limite de tokens atteinte pour user:', userId, `(${tokenCheck.used}/${tokenCheck.limit})`)
        // Envoyer un message de notification au contact
        await evolution.sendText(
          params.instanceName,
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
            await evolution.sendText(
              params.instanceName,
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
      .select('id, content, sent_by, direction, message_type, ai_processed, created_at')
      .eq('conversation_id', params.conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES)

    // 3. Remettre en ordre chronologique et construire les messages pour OpenAI
    // Déchiffrer les messages pour le contexte IA
    const sorted = (recentMessages || []).reverse()
    const chatMessages: ChatMessage[] = sorted
      .filter((m) => m.content)
      .map((m) => ({
        role: m.sent_by === 'contact' ? ('user' as const) : ('assistant' as const),
        content: decryptMessage(m.content!),
      }))

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
    let systemPrompt = agent.system_prompt
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
    await evolution.sendPresence(params.instanceName, params.contactPhoneNumber, 'composing')

    // 5. Appeler OpenAI
    const result = await generateAgentResponse({
      model: agent.model,
      temperature: agent.temperature,
      systemPrompt,
      messages: chatMessages,
    })

    if (!result.ok) {
      console.error('[AI] Erreur OpenAI:', result.error)
      return
    }

    totalTokensUsed += result.tokensUsed
    const aiResponseText = result.content
    console.log('[AI] Réponse OpenAI reçue:', aiResponseText.slice(0, 80) + '...')

    // 6. Envoyer via Evolution API
    const evoResult = await evolution.sendText(
      params.instanceName,
      params.contactPhoneNumber,
      aiResponseText
    )

    if (!evoResult.ok) {
      console.error('[AI] Erreur envoi Evolution:', evoResult.error)
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
      status: evoResult.ok ? 'sent' : 'failed',
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

      if (stopCheckResult.ok && stopCheckResult.content.trim().toUpperCase().startsWith('OUI')) {
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
