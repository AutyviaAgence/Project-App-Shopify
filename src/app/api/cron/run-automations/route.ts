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
    // send
    const r = await sendTemplateToContact({ templateId: step.templateId, contactId: job.contact_id, variables: eventData.variables || {} })
    if (!r.ok) { await mark(supabase, job.id, 'failed', r.error || 'échec'); return 'failed' }
    // Test A/B : enregistre la variante reçue par ce contact (pour les stats).
    if (step.abTest) {
      await supabase.from('ab_test_assignments').upsert({
        user_id: auto.user_id ?? null,
        automation_id: auto.id,
        node_id: step.abTest.nodeId,
        contact_id: job.contact_id,
        variant_key: step.abTest.variant,
      }, { onConflict: 'automation_id,node_id,contact_id', ignoreDuplicates: true })
    }
    if (step.nextNodeId) {
      // Continuer le workflow immédiatement au prochain tick depuis le nœud suivant.
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
  if (r.ok) { await mark(supabase, job.id, 'sent', null); return 'sent' }
  await mark(supabase, job.id, 'failed', r.error || 'échec')
  return 'failed'
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
