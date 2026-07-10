import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import type { Automation, AutomationConditions, EventContext, TriggerEvent } from './types'

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Enfile les jobs d'automatisation pour un événement Shopify.
 * Appelé depuis les webhooks. Pour chaque automation active correspondant à
 * l'événement et à l'utilisateur, crée un automation_job programmé à
 * (now + delay_minutes). L'idempotence évite les doublons (dedup_key).
 */
export async function enqueueAutomations(params: {
  userId: string
  event: TriggerEvent
  ctx: EventContext
}): Promise<{ queued: number }> {
  const supabase = admin()

  const { data: automationsRaw } = await supabase
    .from('automations')
    .select('id, delay_minutes, builder_mode, trigger_button_text')
    .eq('user_id', params.userId)
    .eq('trigger_event', params.event)
    .eq('is_active', true)

  let automations = automationsRaw
  // button_clicked : ne garder que les automations dont le libellé de bouton
  // correspond (comparaison insensible casse/espaces). trigger_button_text NULL
  // = "n'importe quel bouton".
  if (params.event === 'button_clicked') {
    const norm = (s?: string | null) => (s || '').trim().toLowerCase()
    const clicked = norm(params.ctx.buttonTitle)
    automations = (automationsRaw || []).filter(
      (a) => !a.trigger_button_text || norm(a.trigger_button_text) === clicked
    )
  }

  if (!automations || automations.length === 0) return { queued: 0 }

  const now = Date.now()
  let queued = 0
  for (const a of automations) {
    // Builder : le graphe gère ses propres délais → on démarre immédiatement.
    const scheduledAt = a.builder_mode
      ? new Date(now).toISOString()
      : new Date(now + (a.delay_minutes || 0) * 60_000).toISOString()
    const dedupKey = params.ctx.dedupKey ? `${params.event}:${params.ctx.dedupKey}` : null

    const { error } = await supabase.from('automation_jobs').insert({
      automation_id: a.id,
      user_id: params.userId,
      contact_id: params.ctx.contactId,
      event_data: {
        variables: params.ctx.variables,
        total: params.ctx.total ?? null,
        isFirstOrder: params.ctx.isFirstOrder ?? null,
        productTitles: params.ctx.productTitles ?? null,
        collections: params.ctx.collections ?? null,
        country: params.ctx.country ?? null,
        language: params.ctx.language ?? null,
      },
      scheduled_at: scheduledAt,
      status: 'pending',
      current_node_id: null,
      dedup_key: dedupKey,
    })
    // 23505 = doublon dedup (déjà enfilé) → on ignore silencieusement
    if (!error) queued++
    else if (error.code !== '23505') console.error('[automations] enqueue error:', error.message)
  }
  return { queued }
}

/**
 * Évalue les conditions métier d'une automation contre les données d'événement.
 * Retourne null si OK, sinon une raison de skip.
 */
export function evaluateConditions(
  conditions: AutomationConditions,
  data: { total?: number | null; isFirstOrder?: boolean | null }
): string | null {
  if (conditions.min_total != null && (data.total == null || data.total < conditions.min_total)) {
    return `montant < ${conditions.min_total}`
  }
  if (conditions.max_total != null && (data.total != null && data.total > conditions.max_total)) {
    return `montant > ${conditions.max_total}`
  }
  if (conditions.first_order_only && data.isFirstOrder === false) {
    return 'pas la première commande'
  }
  return null
}

/**
 * Vérifie la fenêtre horaire "quiet hours". Retourne la prochaine date d'envoi
 * autorisée (ou la date actuelle si on est hors quiet hours).
 *
 * quiet_start/quiet_end en heures locales (timezone). Ex: 21→8 = ne pas envoyer
 * entre 21h et 8h → repousser à 8h.
 */
export function nextAllowedSend(
  now: Date,
  quietStart: number | null,
  quietEnd: number | null,
  timezone: string
): Date {
  if (quietStart == null || quietEnd == null) return now

  // Heure locale courante dans la timezone de l'automation.
  const localHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(now)
  )

  const inQuiet = quietStart < quietEnd
    ? (localHour >= quietStart && localHour < quietEnd)        // ex: 0→8
    : (localHour >= quietStart || localHour < quietEnd)        // ex: 21→8 (traverse minuit)

  if (!inQuiet) return now

  // Repousser à quiet_end (prochaine occurrence). On calcule le nombre d'heures
  // à attendre jusqu'à quiet_end.
  let hoursToWait = (quietEnd - localHour + 24) % 24
  if (hoursToWait === 0) hoursToWait = 24
  return new Date(now.getTime() + hoursToWait * 60 * 60 * 1000)
}

export type { Automation }

/**
 * FUNNEL À BOUTONS : un contact vient de cliquer un bouton. Si un job de
 * campagne est PARQUÉ (status='waiting') sur un message à boutons pour ce
 * contact, on le REPREND sur la branche correspondant au libellé cliqué :
 * on résout le node cible (resumeFromButton), on repasse le job en 'pending'
 * pointé dessus, le cron enchaîne au prochain tick.
 *
 * Sans job parqué ou sans branche correspondante : no-op (le clic peut encore
 * démarrer une automation button_clicked indépendante, gérée à côté).
 */
export async function resumeParkedFunnel(contactId: string, clickedText: string): Promise<boolean> {
  if (!contactId) return false
  const supabase = admin()

  // Job parqué le plus récent pour ce contact (un contact ne devrait en avoir
  // qu'un à la fois sur un funnel, mais on prend le dernier par sécurité).
  const { data: jobs } = await supabase
    .from('automation_jobs')
    .select('id, automation_id, current_node_id')
    .eq('contact_id', contactId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(5)
  if (!jobs || jobs.length === 0) return false

  const { resumeFromButton } = await import('./graph-engine')

  for (const job of jobs as { id: string; automation_id: string; current_node_id: string | null }[]) {
    if (!job.current_node_id) continue
    const { data: auto } = await supabase
      .from('automations').select('graph, is_active').eq('id', job.automation_id).maybeSingle()
    if (!auto?.is_active || !auto.graph) continue

    const next = resumeFromButton(auto.graph, job.current_node_id, clickedText)
    if (!next) continue // ce funnel n'a pas de branche pour ce bouton → on tente le suivant

    // Trace la branche cliquée pour les stats (best-effort). `clicked_branch`
    // peut manquer si la migration n'est pas encore passée → on retombe sur un
    // update sans cette colonne.
    const trace = { responded: true, responded_at: new Date().toISOString() }
    const { error: tErr } = await supabase.from('ab_test_assignments')
      .update({ ...trace, clicked_branch: `button:${clickedText}` })
      .eq('automation_id', job.automation_id).eq('node_id', job.current_node_id).eq('contact_id', contactId)
    if (tErr && (tErr.code === '42703' || /clicked_branch/.test(tErr.message || ''))) {
      await supabase.from('ab_test_assignments').update(trace)
        .eq('automation_id', job.automation_id).eq('node_id', job.current_node_id).eq('contact_id', contactId)
    }

    // Réveille le job sur la branche : le cron enchaîne immédiatement.
    await supabase.from('automation_jobs').update({
      status: 'pending', current_node_id: next, scheduled_at: new Date().toISOString(),
    }).eq('id', job.id)
    return true
  }
  return false
}
