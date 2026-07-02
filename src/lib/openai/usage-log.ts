import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * Journalise CHAQUE appel IA (feature + modèle + tokens + coût $) dans
 * `ai_usage_log`, pour mesurer les vrais coûts et caler le pricing.
 * Best-effort : ne jette jamais (ne doit pas casser une réponse IA).
 */

// Tarifs OpenAI en USD par 1 000 000 de tokens (input / output), maj 2025.
// Si un modèle n'est pas listé, on retombe sur gpt-4o-mini (prudent, bas).
const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o': { in: 2.50, out: 10.0 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4.1': { in: 2.00, out: 8.00 },
  'text-embedding-3-small': { in: 0.02, out: 0.0 },
  'text-embedding-3-large': { in: 0.13, out: 0.0 },
  // whisper : facturé à la minute, pas au token → coût passé explicitement.
}

export type AiFeature =
  | 'sav_reply' | 'lifecycle' | 'template_generate' | 'translate'
  | 'vision' | 'transcription' | 'agent_generate' | 'refine_prompt'
  | 'optimize_prompt' | 'summary' | 'extract_info' | 'email'
  | 'campaign' | 'escalation' | 'embedding' | 'other'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Calcule le coût USD d'un appel à partir du modèle et des tokens. */
export function computeCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model] || PRICING['gpt-4o-mini']
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
}

/**
 * Loggue un appel IA. Passe soit prompt/completion tokens (OpenAI usage), soit
 * un coût direct (ex: whisper facturé à la minute → costUsdOverride).
 */
export async function logAiUsage(params: {
  feature: AiFeature
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsdOverride?: number
  latencyMs?: number
  userId?: string | null
  contactId?: string | null
  conversationId?: string | null
}): Promise<void> {
  try {
    const prompt = params.promptTokens ?? 0
    const completion = params.completionTokens ?? 0
    const total = params.totalTokens ?? (prompt + completion)
    const cost = params.costUsdOverride ?? computeCostUsd(params.model, prompt, completion)

    await admin().from('ai_usage_log').insert({
      user_id: params.userId ?? null,
      contact_id: params.contactId ?? null,
      conversation_id: params.conversationId ?? null,
      feature: params.feature,
      model: params.model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      cost_usd: Number(cost.toFixed(6)),
      latency_ms: params.latencyMs ?? null,
    })
  } catch (err) {
    console.error('[ai-usage-log] échec log:', err instanceof Error ? err.message : err)
  }
}
