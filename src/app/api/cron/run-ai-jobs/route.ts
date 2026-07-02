import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { processAIResponse } from '@/lib/openai/process-ai-response'

/**
 * Cron — draine la file ai_jobs (réponses IA enfilées en pic).
 *
 * Le webhook enfile ici quand le sémaphore global des réponses IA est plein
 * (burst). Ce endpoint reprend les jobs pending, ré-invoque processAIResponse
 * depuis les IDs stockés (session/token waba re-fetch par session_id) et marque
 * chaque job. Concurrence bornée (lots de 10) pour ne pas re-saturer le VPS.
 *
 * NB : `drainAiJobs()` est AUSSI appelé par run-automations (qui tourne déjà
 * chaque minute) → pas besoin d'une tâche cron dédiée. Cet endpoint reste
 * disponible pour un drain manuel/séparé (Authorization: Bearer CRON_SECRET).
 */

const MAX_ATTEMPTS = 3

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const result = await drainAiJobs(getAdminSupabase())
  return NextResponse.json({ ok: true, ...result })
}

/**
 * Draine la file ai_jobs. Extrait pour être appelé soit par ce endpoint, soit
 * par run-automations (mutualise le schedule d'une minute déjà en place).
 */
export async function drainAiJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: jobs } = await supabase
    .from('ai_jobs')
    .select('id, conversation_id, session_id, agent_id, contact_phone, instance_name, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true }) // FIFO
    .limit(500)

  const counts = { sent: 0, failed: 0 }
  const allJobs = (jobs || []) as JobRow[]

  // Concurrence bornée : lots de 10 en parallèle (mirror run-automations).
  const BATCH = 10
  for (let i = 0; i < allJobs.length; i += BATCH) {
    const slice = allJobs.slice(i, i + BATCH)
    const outcomes = await Promise.all(slice.map((job) => processJob(supabase, job)))
    for (const o of outcomes) counts[o]++
  }

  return { processed: allJobs.length, ...counts }
}

type JobRow = {
  id: string
  conversation_id: string
  session_id: string
  agent_id: string
  contact_phone: string
  instance_name: string
  attempts: number
}
type Outcome = 'sent' | 'failed'

/**
 * Traite UN job de réponse IA. processAIResponse gère ses propres erreurs et ne
 * throw jamais → l'issue normale est 'sent'. Le try/attempts est une ceinture :
 * si la frontière externe throw (ex. erreur DB transitoire), on incrémente
 * attempts ; au 3e échec la ligne passe 'failed' (garde-fou anti-poison), sinon
 * elle reste 'pending' et sera retentée au prochain tick.
 */
async function processJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  job: JobRow
): Promise<Outcome> {
  try {
    // session OMISE → processAIResponse re-fetch le token waba par session_id.
    await processAIResponse({
      conversationId: job.conversation_id,
      sessionId: job.session_id,
      instanceName: job.instance_name,
      contactPhoneNumber: job.contact_phone,
      agentId: job.agent_id,
    })
    await mark(supabase, job.id, 'sent', null)
    return 'sent'
  } catch (err) {
    const attempts = (job.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await mark(supabase, job.id, 'failed', `abandon après ${attempts} tentatives: ${String(err)}`)
    } else {
      await supabase.from('ai_jobs').update({ attempts, result: String(err) }).eq('id', job.id)
    }
    return 'failed'
  }
}

async function mark(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  status: 'sent' | 'failed',
  result: string | null
) {
  await supabase.from('ai_jobs')
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq('id', id)
}
