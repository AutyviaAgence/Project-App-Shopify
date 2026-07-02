import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'

/**
 * Enfile une réponse IA en attente dans `ai_jobs` (chemin "burst" : quand le
 * sémaphore global est plein). Le cron run-ai-jobs draine la file plus tard.
 *
 * Ne stocke QUE des IDs + le contexte minimal : processAIResponse re-fetch la
 * session (token waba) par session_id. Dédup sur wa_message_id via l'index
 * unique → un même message n'est jamais enfilé deux fois (code 23505 avalé,
 * comme enqueueAutomations).
 */
export async function enqueueAiJob(params: {
  conversationId: string
  sessionId: string
  agentId: string
  contactPhone: string
  instanceName: string
  userId?: string | null
  waMessageId?: string | null // devient dedup_key
}): Promise<{ enqueued: boolean }> {
  const supabase = getAdminSupabase()
  const { error } = await supabase.from('ai_jobs').insert({
    conversation_id: params.conversationId,
    session_id: params.sessionId,
    agent_id: params.agentId,
    contact_phone: params.contactPhone,
    instance_name: params.instanceName,
    user_id: params.userId ?? null,
    status: 'pending',
    dedup_key: params.waMessageId || null,
  })

  // 23505 = doublon dedup (message déjà enfilé) → idempotent, on ignore.
  if (error && error.code !== '23505') {
    console.error('[ai-queue] enqueue error:', error.message)
    return { enqueued: false }
  }
  return { enqueued: true }
}
