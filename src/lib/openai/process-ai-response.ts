import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage } from './client'
import { evolution } from '@/lib/evolution/client'

const MAX_CONTEXT_MESSAGES = 20

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

    // 2. Récupérer l'historique récent des messages pour le contexte
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, content, sent_by, direction, message_type, ai_processed, created_at')
      .eq('conversation_id', params.conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_CONTEXT_MESSAGES)

    // 3. Construire les messages pour OpenAI
    const chatMessages: ChatMessage[] = (recentMessages || [])
      .filter((m) => m.content)
      .map((m) => ({
        role: m.sent_by === 'contact' ? ('user' as const) : ('assistant' as const),
        content: m.content!,
      }))

    // 4. Construire le prompt système (inclure l'objectif si défini)
    let systemPrompt = agent.system_prompt
    if (agent.objective) {
      systemPrompt += `\n\nObjectif principal : ${agent.objective}`
    }

    console.log('[AI] Contexte:', chatMessages.length, 'messages | Appel OpenAI...')

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

    // 7. Sauvegarder le message IA en BDD
    await supabase.from('messages').insert({
      conversation_id: params.conversationId,
      session_id: params.sessionId,
      direction: 'outbound',
      content: aiResponseText,
      message_type: 'text',
      sent_by: 'ai_agent',
      ai_agent_id: params.agentId,
      status: evoResult.ok ? 'sent' : 'failed',
    })

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
