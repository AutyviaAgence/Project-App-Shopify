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

Voici les étapes du pipeline commercial de l'utilisateur :
${stagesListForPrompt}

Voici les derniers messages de la conversation (du plus ancien au plus récent) :
${messagesList}

Quelles étapes correspondent le mieux à cette conversation ?
Choisis de 0 à 3 étapes MAXIMUM, les plus pertinentes, de la plus pertinente à la moins pertinente.
- Ne mets QUE des étapes qui correspondent vraiment. Si une seule correspond, n'en mets qu'une.
- Si AUCUNE ne correspond, renvoie un tableau vide.
- N'invente jamais d'étape : chaque nom doit correspondre EXACTEMENT à un des noms listés ci-dessus (copie le nom tel quel).

Réponds UNIQUEMENT en JSON : { "stages": ["...", "..."], "reason": "..." }
La reason doit être une phrase courte en français expliquant ton choix.`

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

    // 6. Parser la réponse JSON : tableau de 0 à 3 noms d'étapes.
    let stageNames: string[] = []
    let reason = 'Impossible de parser la réponse IA'

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // Rétrocompat : accepte "stages" (tableau) ou l'ancien "stage_name".
        if (Array.isArray(parsed.stages)) {
          stageNames = parsed.stages.filter((s: unknown) => typeof s === 'string')
        } else if (parsed.stage_name) {
          stageNames = [parsed.stage_name]
        }
        reason = parsed.reason || 'Pas de raison fournie'
      }
    } catch {
      console.error('[Lifecycle] Failed to parse AI response:', rawContent)
    }

    // 7. Matcher chaque nom (exact → fuzzy → partiel), dédupliquer, plafonner à 3.
    const matchStage = (name: string) => {
      let m = stages.find((s) => s.name.toLowerCase() === name.toLowerCase())
      if (!m) {
        const normalized = normalizeForMatch(name)
        m = stages.find((s) => normalizeForMatch(s.name) === normalized)
        if (!m) {
          m = stages.find(
            (s) => normalizeForMatch(s.name).includes(normalized) || normalized.includes(normalizeForMatch(s.name))
          )
        }
      }
      return m
    }

    const matchedIds: string[] = []
    for (const name of stageNames) {
      const m = matchStage(name)
      if (m && !matchedIds.includes(m.id)) matchedIds.push(m.id)
      if (matchedIds.length >= 3) break // plafond : 3 étapes max
    }
    const primaryStageId = matchedIds[0] || null // 1re = la plus pertinente (legacy + historique)
    const matchedNames = matchedIds.map((id) => stages.find((s) => s.id === id)?.name).filter(Boolean)

    // 8. Timestamps + colonne legacy (1re étape, compat affichage/stats).
    await supabase
      .from('conversations')
      .update({
        lifecycle_last_analyzed_at: new Date().toISOString(),
        lifecycle_messages_since_analysis: 0,
        lifecycle_stage_id: primaryStageId,
      })
      .eq('id', conversationId)

    // 8b. RECALCUL : les étapes auto reflètent l'état ACTUEL. Remplacement
    //     atomique — on efface les étiquettes existantes puis on pose les
    //     nouvelles (0 à 3). Si aucune ne correspond, la conversation se
    //     retrouve sans étape auto (nettoyée).
    const changed = primaryStageId !== currentStageId
    await supabase.from('conversation_lifecycle_stages').delete().eq('conversation_id', conversationId)
    if (matchedIds.length > 0) {
      await supabase
        .from('conversation_lifecycle_stages')
        .insert(matchedIds.map((sid) => ({ conversation_id: conversationId, stage_id: sid })))
    }

    // 9. Historique (seulement si l'étape principale a changé).
    if (changed && primaryStageId) {
      const { error: historyError } = await supabase.from('lifecycle_history').insert({
        conversation_id: conversationId,
        from_stage_id: currentStageId,
        to_stage_id: primaryStageId,
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

    console.log(`[Lifecycle] ✓ Conversation ${conversationId} → [${matchedNames.join(', ') || 'aucune'}] (${reason})`)

    return {
      conversationId,
      stageId: primaryStageId,
      stageName: matchedNames[0] || null,
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
