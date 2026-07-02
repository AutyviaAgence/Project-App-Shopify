import 'server-only'
import OpenAI from 'openai'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { decryptMessage } from '@/lib/crypto/encryption'
import { recordTokenUsage } from './token-tracker'
import { logAiUsage } from './usage-log'

function getAdminClient() {
  return getAdminSupabase()
}

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[Lifecycle] OPENAI_API_KEY is required')
  openaiClient = new OpenAI({ apiKey, maxRetries: 4, timeout: 60_000 })
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
 * Normalise un nom de stage pour la comparaison (accents, casse, espaces).
 */
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-z0-9\s]/g, '') // Garder uniquement alphanum + espaces
    .replace(/\s+/g, ' ')
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

  console.log(`[Lifecycle] Starting analysis for conversation ${conversationId}, user ${userId}`)

  // 1. Récupérer les stages de l'utilisateur
  const { data: stages, error: stagesError } = await supabase
    .from('lifecycle_stages')
    .select('*')
    .eq('user_id', userId)
    .order('position')

  if (stagesError) {
    console.error('[Lifecycle] Error fetching stages:', stagesError.message)
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: `Erreur DB stages: ${stagesError.message}`,
      tokensUsed: 0,
    }
  }

  if (!stages || stages.length === 0) {
    console.warn(`[Lifecycle] No stages found for user ${userId}`)
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: 'Aucun stage configuré',
      tokensUsed: 0,
    }
  }

  console.log(`[Lifecycle] Found ${stages.length} stages: ${stages.map(s => s.name).join(', ')}`)

  // 2. Récupérer le stage actuel de la conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('lifecycle_stage_id')
    .eq('id', conversationId)
    .single()

  const currentStageId = conversation?.lifecycle_stage_id || null

  // 3. Récupérer les 20 derniers messages (déchiffrés)
  const { data: messages, error: msgsError } = await supabase
    .from('messages')
    .select('content, transcription, sent_by, message_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (msgsError) {
    console.error('[Lifecycle] Error fetching messages:', msgsError.message)
  }

  if (!messages || messages.length === 0) {
    console.warn(`[Lifecycle] No messages found for conversation ${conversationId}`)
    return {
      conversationId,
      stageId: null,
      stageName: null,
      reason: 'Aucun message dans la conversation',
      tokensUsed: 0,
    }
  }

  console.log(`[Lifecycle] Found ${messages.length} messages for conversation ${conversationId}`)

  // Trier du plus ancien au plus récent pour le contexte
  const orderedMessages = messages.reverse()

  // 4. Construire le prompt
  const stagesListForPrompt = stages
    .map((s, i) => `${i + 1}. ${s.name}: ${s.description || 'Pas de description'}`)
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
${stagesListForPrompt}

Voici les derniers messages de la conversation (du plus ancien au plus récent) :
${messagesList}

Quel stade correspond le mieux à cette conversation ?
Réponds UNIQUEMENT en JSON : { "stage_name": "...", "reason": "..." }
Le stage_name doit correspondre EXACTEMENT à un des noms de stades listés ci-dessus (copie le nom tel quel).
La reason doit être une phrase courte en français expliquant pourquoi.`

  // 5. Appeler GPT-4o-mini
  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: systemPrompt }],
      max_tokens: 150,
      temperature: 0.3,
    })

    const tokensUsed = response.usage?.total_tokens || 0
    const rawContent = response.choices[0]?.message?.content || ''

    void logAiUsage({
      feature: 'lifecycle',
      model: response.model || 'gpt-4o-mini',
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      userId,
      conversationId,
    })

    console.log(`[Lifecycle] AI response for ${conversationId}: ${rawContent} (${tokensUsed} tokens)`)

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

    // 7. Trouver le stage correspondant (exact match, puis fuzzy)
    let matchedStage = stageName
      ? stages.find((s) => s.name.toLowerCase() === stageName!.toLowerCase())
      : null

    // Fuzzy match si exact match échoue (accents, espaces, etc.)
    if (!matchedStage && stageName) {
      const normalized = normalizeForMatch(stageName)
      matchedStage = stages.find((s) => normalizeForMatch(s.name) === normalized)

      // Fallback: match partiel (le nom du stage est contenu dans la réponse ou vice-versa)
      if (!matchedStage) {
        matchedStage = stages.find(
          (s) => normalizeForMatch(s.name).includes(normalized) || normalized.includes(normalizeForMatch(s.name))
        )
      }

      if (matchedStage) {
        console.log(`[Lifecycle] Fuzzy matched "${stageName}" → "${matchedStage.name}"`)
      } else {
        console.warn(`[Lifecycle] No match found for stage_name "${stageName}". Available: ${stages.map(s => s.name).join(', ')}`)
      }
    }

    const newStageId = matchedStage?.id || null

    // 8. Timestamps d'analyse (toujours mis à jour)
    await supabase
      .from('conversations')
      .update({
        lifecycle_last_analyzed_at: new Date().toISOString(),
        lifecycle_messages_since_analysis: 0,
        // lien legacy : refléter le stage détecté (compat affichage)
        lifecycle_stage_id: newStageId,
      })
      .eq('id', conversationId)

    // 8b. ÉTIQUETTES MULTIPLES : l'IA AJOUTE le stage détecté (sans écraser les autres)
    let alreadyAssigned = false
    if (newStageId) {
      const { data: existing } = await supabase
        .from('conversation_lifecycle_stages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('stage_id', newStageId)
        .maybeSingle()
      alreadyAssigned = !!existing
      if (!alreadyAssigned) {
        await supabase
          .from('conversation_lifecycle_stages')
          .insert({ conversation_id: conversationId, stage_id: newStageId })
      }
    }

    // 9. Historique (seulement si une nouvelle étiquette a été ajoutée)
    if (newStageId && !alreadyAssigned) {
      const { error: historyError } = await supabase.from('lifecycle_history').insert({
        conversation_id: conversationId,
        from_stage_id: currentStageId,
        to_stage_id: newStageId,
        reason: reason,
        changed_by: 'ai',
        tokens_used: tokensUsed,
      })
      if (historyError) {
        console.error(`[Lifecycle] Error inserting history:`, historyError.message)
      }
    }

    // 10. Comptabiliser les tokens
    if (tokensUsed > 0) {
      await recordTokenUsage(userId, tokensUsed)
    }

    console.log(`[Lifecycle] ✓ Conversation ${conversationId} → ${matchedStage?.name || 'null'} (${reason})`)

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

  console.log(`[Lifecycle] Bulk analysis: ${batch.length} conversations for user ${userId}`)

  for (const convId of batch) {
    const result = await analyzeConversationLifecycle(convId, userId)
    results.push(result)
  }

  const classified = results.filter(r => r.stageId !== null).length
  console.log(`[Lifecycle] Bulk complete: ${classified}/${results.length} classified`)

  return results
}
