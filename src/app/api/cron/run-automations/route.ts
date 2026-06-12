import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
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

  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const now = new Date()

  // Jobs dus (limite pour éviter les longues exécutions)
  const { data: jobs } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, contact_id, event_data, scheduled_at, current_node_id')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(100)

  let sent = 0, skipped = 0, failed = 0, deferred = 0

  for (const job of jobs || []) {
    const { data: auto } = await supabase
      .from('automations')
      .select('id, template_id, conditions, quiet_start, quiet_end, timezone, trigger_event, is_active, builder_mode, graph')
      .eq('id', job.automation_id)
      .maybeSingle()

    if (!auto || !auto.is_active) {
      await mark(supabase, job.id, 'skipped', 'automation inactive/supprimée')
      skipped++; continue
    }

    // Quiet hours : repousser si on est dans la fenêtre interdite
    const allowed = nextAllowedSend(now, auto.quiet_start, auto.quiet_end, auto.timezone || 'Europe/Paris')
    if (allowed.getTime() > now.getTime()) {
      await supabase.from('automation_jobs').update({ scheduled_at: allowed.toISOString() }).eq('id', job.id)
      deferred++; continue
    }

    const eventData = (job.event_data || {}) as {
      variables?: Record<string, string>; total?: number | null; isFirstOrder?: boolean | null
      productTitles?: string[]; collections?: string[]; country?: string; language?: string
    }
    if (!job.contact_id) { await mark(supabase, job.id, 'skipped', 'pas de contact'); skipped++; continue }

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

      if (step.kind === 'done') { await mark(supabase, job.id, 'sent', 'workflow terminé'); sent++; continue }
      if (step.kind === 'wait') {
        const when = new Date(now.getTime() + step.minutes * 60_000).toISOString()
        await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: when }).eq('id', job.id)
        deferred++; continue
      }
      // send
      const r = await sendTemplateToContact({ templateId: step.templateId, contactId: job.contact_id, variables: eventData.variables || {} })
      if (!r.ok) { await mark(supabase, job.id, 'failed', r.error || 'échec'); failed++; continue }
      if (step.nextNodeId) {
        // Continuer le workflow immédiatement au prochain tick depuis le nœud suivant.
        await supabase.from('automation_jobs').update({ current_node_id: step.nextNodeId, scheduled_at: now.toISOString() }).eq('id', job.id)
      } else {
        await mark(supabase, job.id, 'sent', null)
      }
      sent++; continue
    }

    // ---- Mode LINÉAIRE (rétrocompat) ----
    if (!auto.template_id) { await mark(supabase, job.id, 'skipped', 'pas de modèle'); skipped++; continue }
    const reason = evaluateConditions(auto.conditions || {}, { total: eventData.total, isFirstOrder: eventData.isFirstOrder })
    if (reason) { await mark(supabase, job.id, 'skipped', reason); skipped++; continue }

    const r = await sendTemplateToContact({
      templateId: auto.template_id,
      contactId: job.contact_id,
      variables: eventData.variables || {},
    })
    if (r.ok) { await mark(supabase, job.id, 'sent', null); sent++ }
    else { await mark(supabase, job.id, 'failed', r.error || 'échec'); failed++ }
  }

  return NextResponse.json({ ok: true, processed: (jobs || []).length, sent, skipped, failed, deferred })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mark(
  supabase: any,
  id: string,
  status: 'sent' | 'skipped' | 'failed',
  result: string | null
) {
  await supabase.from('automation_jobs')
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq('id', id)
}
