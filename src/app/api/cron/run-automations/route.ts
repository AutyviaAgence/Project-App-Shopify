import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { evaluateConditions, nextAllowedSend } from '@/lib/automations/engine'
import { sendTemplateToContact } from '@/lib/automations/dispatch'

/**
 * Cron — dépile la file automation_jobs.
 *
 * Pour chaque job dû (scheduled_at atteint, status pending) :
 *   1) charge l'automation (template, conditions, quiet hours)
 *   2) si quiet hours actives et on est dedans → repousse scheduled_at
 *   3) évalue les conditions métier (montant, 1re commande…)
 *   4) panier abandonné : skip si le contact a finalement commandé
 *   5) envoie le template, marque le job sent/skipped/failed
 *
 * À appeler périodiquement (ex: toutes les 5 min) avec Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getAdminSupabase()
  const now = new Date()

  // Déclencheurs temporels (pas de réponse / date / anniversaire) : on les
  // évalue ici pour n'avoir qu'UN SEUL schedule. Les jobs enfilés sont dus
  // immédiatement et traités dès ce tick (requête jobs ci-dessous).
  let temporalQueued = 0
  try {
    const { runTemporalTriggers } = await import('@/lib/automations/temporal')
    temporalQueued = (await runTemporalTriggers(supabase)).queued
  } catch (e) {
    console.error('[cron] temporal triggers:', e)
  }

  // Jobs dus. On monte la limite (500) et on traite par LOTS PARALLÈLES pour
  // absorber plus de volume par tick sans que le tick s'allonge linéairement.
  const { data: jobs } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, contact_id, event_data, scheduled_at, current_node_id, created_at')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(500)

  // Jobs PARQUÉS sur un message à boutons dont le timeout (72 h) est dépassé :
  // le client n'a jamais cliqué → on les repasse en 'pending' pour que
  // processJob suive la branche timeout (si définie) ou clôture le funnel.
  const { data: expired } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, current_node_id')
    .eq('status', 'waiting')
    .lte('scheduled_at', now.toISOString())
    .limit(200)
  for (const w of (expired || []) as { id: string; automation_id: string; current_node_id: string | null }[]) {
    // On lit le graphe pour trouver la branche timeout de ce nœud d'action.
    const { data: a } = await supabase.from('automations').select('graph').eq('id', w.automation_id).maybeSingle()
    let next: string | null = null
    if (a?.graph && w.current_node_id) {
      const { timeoutTarget } = await import('@/lib/automations/graph-engine')
      next = timeoutTarget(a.graph, w.current_node_id)
    }
    if (next) {
      await supabase.from('automation_jobs').update({ status: 'pending', current_node_id: next, scheduled_at: now.toISOString() }).eq('id', w.id)
    } else {
      await mark(supabase, w.id, 'sent', 'funnel : pas de clic (timeout)')
    }
  }

  const counts = { sent: 0, skipped: 0, failed: 0, deferred: 0 }
  const allJobs = jobs || []

  // Concurrence bornée : lots de 10 en parallèle. Chaque job est indépendant
  // (ligne distincte), donc parallélisable sans risque de course. La borne évite
  // d'ouvrir trop de connexions/appels WhatsApp simultanés.
  const BATCH = 10
  for (let i = 0; i < allJobs.length; i += BATCH) {
    const slice = allJobs.slice(i, i + BATCH)
    const outcomes = await Promise.all(slice.map((job) => processJob(supabase, job, now)))
    for (const o of outcomes) counts[o]++
  }

  // Draine aussi la file des réponses IA enfilées en pic (backpressure). On
  // mutualise ce schedule d'une minute plutôt que d'ajouter une tâche cron dédiée.
  let aiJobs = { processed: 0, sent: 0, failed: 0 }
  try {
    const { drainAiJobs } = await import('@/app/api/cron/run-ai-jobs/route')
    aiJobs = await drainAiJobs(supabase)
  } catch (e) {
    console.error('[cron] drain ai_jobs:', e)
  }

  // Maintenance : purge des vieux webhook_logs (throttlé à 1×/h en interne) pour
  // éviter que la table gonfle (payloads JSON complets → grossit vite).
  try {
    const { purgeWebhookLogs } = await import('@/lib/maintenance/purge-webhook-logs')
    await purgeWebhookLogs(supabase, now.getTime())
  } catch (e) {
    console.error('[cron] purge webhook_logs:', e)
  }

  // Filet de sécurité qualité WhatsApp : relit la santé de tous les numéros
  // chez Meta (throttlé 1×/6h) pour les marchands sans webhooks abonnés.
  try {
    const { sweepWhatsappHealth } = await import('@/lib/whatsapp/health-sweep')
    await sweepWhatsappHealth(supabase, now.getTime())
  } catch (e) {
    console.error('[cron] whatsapp health sweep:', e)
  }

  return NextResponse.json({ ok: true, processed: allJobs.length, ...counts, temporalQueued, aiJobs })
}

type JobRow = {
  id: string; automation_id: string; contact_id: string | null
  event_data: unknown; scheduled_at: string; current_node_id: string | null; created_at: string | null
}
type Outcome = 'sent' | 'skipped' | 'failed' | 'deferred'

/**
 * Traite UN job d'automation et renvoie son issue. Extrait de la boucle pour
 * pouvoir traiter les jobs en parallèle par lots. Ne throw pas (les erreurs sont
 * remontées en 'failed' via mark).
 */
async function processJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  job: JobRow,
  now: Date
): Promise<Outcome> {
  const { data: auto } = await supabase
    .from('automations')
    .select('id, user_id, template_id, conditions, quiet_start, quiet_end, timezone, trigger_event, is_active, builder_mode, graph')
    .eq('id', job.automation_id)
    .maybeSingle()

  if (!auto || !auto.is_active) {
    await mark(supabase, job.id, 'skipped', 'automation inactive/supprimée')
    return 'skipped'
  }

  // Quiet hours : repousser si on est dans la fenêtre interdite
  const allowed = nextAllowedSend(now, auto.quiet_start, auto.quiet_end, auto.timezone || 'Europe/Paris')
  if (allowed.getTime() > now.getTime()) {
    await supabase.from('automation_jobs').update({ scheduled_at: allowed.toISOString() }).eq('id', job.id)
    return 'deferred'
  }

  const eventData = (job.event_data || {}) as {
    variables?: Record<string, string>; total?: number | null; isFirstOrder?: boolean | null
    productTitles?: string[]; collections?: string[]; country?: string; language?: string
  }
  if (!job.contact_id) { await mark(supabase, job.id, 'skipped', 'pas de contact'); return 'skipped' }

  // PANIER ABANDONNÉ : annuler la relance si le contact a commandé entre-temps
  // (last_order_at postérieur à la création du job). Évite de relancer un client
  // qui a finalement finalisé son achat.
  if (auto.trigger_event === 'checkout_abandoned') {
    const { data: c } = await supabase
      .from('contacts')
      .select('last_order_at')
      .eq('id', job.contact_id)
      .maybeSingle()
    const ordered = c?.last_order_at && job.created_at && new Date(c.last_order_at) > new Date(job.created_at)
    if (ordered) { await mark(supabase, job.id, 'skipped', 'commande finalisée entre-temps'); return 'skipped' }
  }

  // ---- Mode BUILDER (graphe de nœuds) ----
  if (auto.builder_mode && auto.graph) {
    const { stepWorkflow } = await import('@/lib/automations/graph-engine')
    const ctx = {
      contactId: job.contact_id,
      total: eventData.total ?? undefined,
      isFirstOrder: eventData.isFirstOrder ?? undefined,
      productTitles: eventData.productTitles,
      collections: eventData.collections,
      country: eventData.country,
      language: eventData.language,
      variables: eventData.variables || {},
    }
    // current_node_id null = on vient de finir un delay sur ce nœud → on le saute.
    const step = stepWorkflow(auto.graph, ctx, job.current_node_id || null, !!job.current_node_id)

    if (step.kind === 'done') { await mark(supabase, job.id, 'sent', 'workflow terminé'); return 'sent' }
    if (step.kind === 'wait') {
      const when = new Date(now.getTime() + step.minutes * 60_000).toISOString()
      await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: when }).eq('id', job.id)
      return 'deferred'
    }

    // send OU send_wait_click : dans les deux cas on envoie le message.
    const r = await sendTemplateToContact({ templateId: step.templateId, contactId: job.contact_id, variables: eventData.variables || {} })
    if (!r.ok) {
      const d = deferReason(r.error)
      if (d) { await deferJob(supabase, job.id, now, d); return 'deferred' }
      await mark(supabase, job.id, 'failed', r.error || 'échec'); return 'failed'
    }
    // Engagement : on enregistre CHAQUE envoi (entonnoir + A/B). Pour un message
    // à boutons on garde le node id de l'action (pour tracer la branche cliquée).
    await recordEngagement(supabase, auto.user_id, auto.id,
      step.abTest ? step.abTest.nodeId : (step.kind === 'send_wait_click' ? step.nodeId : '_send'), job.contact_id,
      step.abTest ? step.abTest.variant : '_')

    if (step.kind === 'send_wait_click') {
      // FUNNEL À BOUTONS : on PARQUE le job. Le webhook le réveillera au clic
      // (resumeFromButton). Timeout anti-fuite : réveil dans 72 h → le cron
      // suivra la branche timeout (si définie) ou clôturera.
      const timeoutAt = new Date(now.getTime() + 72 * 3600_000).toISOString()
      await supabase.from('automation_jobs').update({
        status: 'waiting', current_node_id: step.nodeId, scheduled_at: timeoutAt,
      }).eq('id', job.id)
      return 'deferred'
    }

    // send simple : continuer au prochain tick, ou clore.
    if (step.nextNodeId) {
      await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: now.toISOString() }).eq('id', job.id)
    } else {
      await mark(supabase, job.id, 'sent', null)
    }
    return 'sent'
  }

  // ---- Mode LINÉAIRE (rétrocompat) ----
  if (!auto.template_id) { await mark(supabase, job.id, 'skipped', 'pas de modèle'); return 'skipped' }
  const reason = evaluateConditions(auto.conditions || {}, { total: eventData.total, isFirstOrder: eventData.isFirstOrder })
  if (reason) { await mark(supabase, job.id, 'skipped', reason); return 'skipped' }

  const r = await sendTemplateToContact({
    templateId: auto.template_id,
    contactId: job.contact_id,
    variables: eventData.variables || {},
  })
  if (r.ok) {
    await recordEngagement(supabase, auto.user_id, auto.id, '_send', job.contact_id, '_')
    await mark(supabase, job.id, 'sent', null); return 'sent'
  }
  const d = deferReason(r.error)
  if (d) { await deferJob(supabase, job.id, now, d); return 'deferred' }
  await mark(supabase, job.id, 'failed', r.error || 'échec')
  return 'failed'
}

/**
 * Enregistre un envoi initié pour l'entonnoir + les stats A/B.
 * Une ligne par (automation, node, contact) — idempotent. Les colonnes
 * opened/responded/ordered sont ensuite remplies par les webhooks.
 */
async function recordEngagement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  automationId: string,
  nodeId: string,
  contactId: string,
  variant: string
) {
  await supabase.from('ab_test_assignments').upsert({
    user_id: userId ?? null,
    automation_id: automationId,
    node_id: nodeId,
    contact_id: contactId,
    variant_key: variant,
  }, { onConflict: 'automation_id,node_id,contact_id', ignoreDuplicates: true })
}

/**
 * Certaines "erreurs" ne sont PAS des échecs : l'envoi doit être RÉESSAYÉ plus
 * tard (jamais perdu). Renvoie le délai de report en minutes, ou null si c'est
 * un vrai échec.
 *   - rate_limited    : palier Meta 24h atteint → +60 min (fenêtre glissante)
 *   - marketing_paused: numéro classé ROUGE → +180 min (attendre le retour vert)
 */
function deferReason(error: string | undefined): number | null {
  if (error === 'rate_limited') return 60
  if (error === 'marketing_paused') return 180
  return null
}

async function deferJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  now: Date,
  minutes: number
) {
  const when = new Date(now.getTime() + minutes * 60_000).toISOString()
  // On garde status 'pending' → le job sera re-tenté ; on ne le marque JAMAIS
  // 'failed' (l'envoi n'est pas perdu, juste étalé).
  await supabase.from('automation_jobs').update({ scheduled_at: when, result: `report: ${minutes}min` }).eq('id', id)
}

async function mark(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  status: 'sent' | 'skipped' | 'failed',
  result: string | null
) {
  await supabase.from('automation_jobs')
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq('id', id)
}
