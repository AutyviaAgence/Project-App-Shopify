import 'server-only'
import OpenAI from 'openai'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'
import { recordTokenUsage } from './token-tracker'

function getAdminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[Lifecycle] OPENAI_API_KEY is required')
  openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

export type LifecycleAnalysisResult = {
  conversationId: string
  stageId: string | null
  stageName: string | null
  reason: string
  tokensUsed: number
}

/**
 * Analyse une conversation et la classifie dans un stage du pipeline.
 * Utilise GPT-4o-mini pour rapidité et coût minimal (~0.001$/analyse).
 */
export async function analyzeConversationLifecycle(
  conversationId: string,
  userId: string
): Promise<LifecycleAnalysisResult> {
  const supabase = getAdminClient()

  // 1. Récupérer les stages de l'utilisateur
  const { data: stages } = await supabase
    .from('lifecycle_stages')
    .select('*')
    .eq('user_id', userId)
    .order('position')

  if (!stages || stages.length === 0) {
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: 'Aucun stage configuré',
      tokensUsed: 0,
    }
  }

  // 2. Récupérer le stage actuel de la conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('lifecycle_stage_id')
    .eq('id', conversationId)
    .single()

  const currentStageId = conversation?.lifecycle_stage_id || null

  // 3. Récupérer les 20 derniers messages (déchiffrés)
  const { data: messages } = await supabase
    .from('messages')
    .select('content, transcription, sent_by, message_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!messages || messages.length === 0) {
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: 'Aucun message dans la conversation',
      tokensUsed: 0,
    }
  }

  // Trier du plus ancien au plus récent pour le contexte
  const orderedMessages = messages.reverse()

  // 4. Construire le prompt
  const stagesList = stages
    .map((s) => `- ${s.name}: ${s.description || 'Pas de description'}`)
    .join('\n')

  const messagesList = orderedMessages
    .map((m) => {
      const content = m.content ? decryptMessage(m.content) : null
      const transcription = m.transcription ? decryptMessage(m.transcription) : null
      const text = content || transcription || `[${m.message_type}]`
      return `[${m.sent_by}] ${text}`
    })
    .join('\n')

  const systemPrompt = `Tu es un assistant de classification de conversations WhatsApp.

Voici les stades du pipeline commercial de l'utilisateur :
${stagesList}

Voici les derniers messages de la conversation (du plus ancien au plus récent) :
${messagesList}

Quel stade correspond le mieux à cette conversation ?
Réponds UNIQUEMENT en JSON : { "stage_name": "...", "reason": "..." }
Le stage_name doit correspondre exactement à un des stades listés ci-dessus.
La reason doit être une phrase courte expliquant pourquoi.`

  // 5. Appeler GPT-4o-mini
  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: systemPrompt }],
      max_tokens: 150,
      temperature: 0.3,
    })

    const tokensUsed = response.usage?.total_tokens || 0
    const rawContent = response.choices[0]?.message?.content || ''

    // 6. Parser la réponse JSON
    let stageName: string | null = null
    let reason = 'Impossible de parser la réponse IA'

    try {
      // Extraire le JSON même si entouré de markdown
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        stageName = parsed.stage_name || null
        reason = parsed.reason || 'Pas de raison fournie'
      }
    } catch {
      console.error('[Lifecycle] Failed to parse AI response:', rawContent)
    }

    // 7. Trouver le stage correspondant
    const matchedStage = stageName
      ? stages.find((s) => s.name.toLowerCase() === stageName!.toLowerCase())
      : null

    const newStageId = matchedStage?.id || null

    // 8. Mettre à jour la conversation
    await supabase
      .from('conversations')
      .update({
        lifecycle_stage_id: newStageId,
        lifecycle_last_analyzed_at: new Date().toISOString(),
        lifecycle_messages_since_analysis: 0,
      })
      .eq('id', conversationId)

    // 9. Insérer dans l'historique (seulement si le stage a changé)
    if (newStageId !== currentStageId) {
      await supabase.from('lifecycle_history').insert({
        conversation_id: conversationId,
        from_stage_id: currentStageId,
        to_stage_id: newStageId,
        reason: reason,
        changed_by: 'ai',
        tokens_used: tokensUsed,
      })
    }

    // 10. Comptabiliser les tokens
    if (tokensUsed > 0) {
      await recordTokenUsage(userId, tokensUsed)
    }

    return {
      conversationId,
      stageId: newStageId,
      stageName: matchedStage?.name || null,
      reason,
      tokensUsed,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Lifecycle] AI analysis error:', message)
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: `Erreur IA: ${message}`,
      tokensUsed: 0,
    }
  }
}

/**
 * Analyse plusieurs conversations en bulk.
 * Limite à 50 par appel pour éviter les timeouts.
 */
export async function analyzeMultipleConversations(
  conversationIds: string[],
  userId: string
): Promise<LifecycleAnalysisResult[]> {
  const MAX_BATCH = 50
  const batch = conversationIds.slice(0, MAX_BATCH)
  const results: LifecycleAnalysisResult[] = []

  for (const convId of batch) {
    const result = await analyzeConversationLifecycle(convId, userId)
    results.push(result)
  }

  return results
}
