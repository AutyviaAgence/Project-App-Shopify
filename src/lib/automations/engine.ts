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

  const { data: automations } = await supabase
    .from('automations')
    .select('id, delay_minutes')
    .eq('user_id', params.userId)
    .eq('trigger_event', params.event)
    .eq('is_active', true)

  if (!automations || automations.length === 0) return { queued: 0 }

  const now = Date.now()
  let queued = 0
  for (const a of automations) {
    const scheduledAt = new Date(now + (a.delay_minutes || 0) * 60_000).toISOString()
    const dedupKey = params.ctx.dedupKey ? `${params.event}:${params.ctx.dedupKey}` : null

    const { error } = await supabase.from('automation_jobs').insert({
      automation_id: a.id,
      user_id: params.userId,
      contact_id: params.ctx.contactId,
      event_data: {
        variables: params.ctx.variables,
        total: params.ctx.total ?? null,
        isFirstOrder: params.ctx.isFirstOrder ?? null,
      },
      scheduled_at: scheduledAt,
      status: 'pending',
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
