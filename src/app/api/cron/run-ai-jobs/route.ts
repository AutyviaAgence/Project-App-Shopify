import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { processAIResponse } from '@/lib/openai/process-ai-response'
import { enqueueAiJob } from '@/lib/ai-queue/enqueue'

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
  // 0. Rattrapage : ré-enfile les messages entrants restés sans réponse IA
  //    (crash/redéploiement en plein traitement). Idempotent via la dédup ai_jobs.
  try {
    await recoverOrphanedAiReplies(supabase)
  } catch (e) {
    console.error('[ai-jobs] recover orphans:', e)
  }

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

/**
 * RATTRAPAGE — ré-enfile les messages entrants restés sans réponse IA.
 *
 * Cas couverts : crash/redéploiement pendant qu'une réponse IA était en vol
 * (message inséré, ai_processed=false, jamais répondu). Sans ce filet, le
 * client n'aurait JAMAIS sa réponse.
 *
 * Garde-fous :
 * - Fenêtre 10 min → 24 h : >10 min évite de doubler une réponse encore en vol
 *   (l'appel OpenAI + retries peut durer plusieurs minutes) ; <24 h évite de
 *   ressusciter de vieux historiques au premier déploiement.
 * - 1 seul job par CONVERSATION (le plus récent) : l'IA relit tout l'historique
 *   à chaque réponse → inutile de répondre 3 fois pour 3 messages orphelins.
 * - Skip si une réponse sortante existe déjà après le message (réponse manuelle
 *   du marchand) → on marque ai_processed pour ne plus le rescanner.
 * - Idempotent : la dédup ai_jobs (wa_message_id) bloque tout double enqueue.
 */
async function recoverOrphanedAiReplies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<void> {
  const now = Date.now()
  const olderThan = new Date(now - 10 * 60 * 1000).toISOString()   // > 10 min
  const newerThan = new Date(now - 24 * 60 * 60 * 1000).toISOString() // < 24 h

  const { data: orphans } = await supabase
    .from('messages')
    .select('id, wa_message_id, conversation_id, created_at, conversations!inner(id, is_ai_active, ai_agent_id, session_id, contact_id)')
    .eq('direction', 'inbound')
    .eq('ai_processed', false)
    .eq('conversations.is_ai_active', true)
    .not('conversations.ai_agent_id', 'is', null)
    .not('conversations.session_id', 'is', null) // exclut les conversations email
    .lt('created_at', olderThan)
    .gt('created_at', newerThan)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!orphans || orphans.length === 0) return

  // 1 seul candidat par conversation : le message le PLUS RÉCENT (l'ordre DESC
  // garantit qu'on le voit en premier) ; les plus anciens sont juste marqués
  // traités (la réponse IA couvrira tout l'historique).
  const seenConversations = new Set<string>()
  type OrphanRow = {
    id: string; wa_message_id: string | null; conversation_id: string; created_at: string
    conversations: { id: string; is_ai_active: boolean; ai_agent_id: string; session_id: string; contact_id: string | null }
  }

  for (const o of orphans as OrphanRow[]) {
    if (seenConversations.has(o.conversation_id)) {
      await supabase.from('messages').update({ ai_processed: true }).eq('id', o.id)
      continue
    }
    seenConversations.add(o.conversation_id)

    // Le marchand (ou l'IA) a-t-il déjà répondu après ce message ? → rien à
    // rattraper, on marque pour ne plus rescanner.
    const { data: reply } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', o.conversation_id)
      .eq('direction', 'outbound')
      .gt('created_at', o.created_at)
      .limit(1)
      .maybeSingle()
    if (reply) {
      await supabase.from('messages').update({ ai_processed: true }).eq('id', o.id)
      continue
    }

    // Contexte nécessaire au job : téléphone du contact + instance de la session.
    const conv = o.conversations
    const [{ data: contact }, { data: sess }] = await Promise.all([
      conv.contact_id
        ? supabase.from('contacts').select('phone_number').eq('id', conv.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('whatsapp_sessions').select('instance_name, user_id').eq('id', conv.session_id).maybeSingle(),
    ])
    if (!contact?.phone_number || !sess) {
      // Impossible de reconstruire le contexte → marquer pour ne pas boucler.
      await supabase.from('messages').update({ ai_processed: true }).eq('id', o.id)
      continue
    }

    console.log(`[ai-jobs] rattrapage message orphelin ${o.id} (conv ${o.conversation_id})`)
    await enqueueAiJob({
      conversationId: o.conversation_id,
      sessionId: conv.session_id,
      agentId: conv.ai_agent_id,
      contactPhone: contact.phone_number,
      instanceName: sess.instance_name || '',
      userId: sess.user_id ?? null,
      // Même convention de dédup que le webhook (wa_message_id brut) pour que
      // l'index unique bloque tout doublon avec un job déjà enfilé en burst.
      waMessageId: o.wa_message_id || `recover:${o.id}`,
    })
    // NB : on ne marque PAS ai_processed ici — c'est processAIResponse qui le
    // fera quand le job aura réellement répondu. Si le job échoue, le message
    // reste candidat mais la dédup ai_jobs empêche tout ré-enqueue en boucle.
  }
}
