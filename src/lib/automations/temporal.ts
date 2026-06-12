import 'server-only'

/**
 * Déclencheurs TEMPORELS (hors webhooks Shopify) — réutilisable.
 * Appelé par le cron run-automations (un seul schedule suffit) :
 *   - no_customer_reply : conversations sans réponse depuis X heures
 *   - scheduled_date     : date/heure précise
 *   - customer_birthday  : jour d'anniversaire (contacts.metadata.birthday)
 *
 * Enfile des automation_jobs (exécutés par le même cron). Idempotent (dedup_key).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any
type Auto = { id: string; user_id: string }

export async function runTemporalTriggers(supabase: SB): Promise<{ queued: number }> {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const { data: autos } = await supabase
    .from('automations')
    .select('id, user_id, trigger_event, graph, triggered_once_at')
    .eq('is_active', true)
    .eq('builder_mode', true)
    .in('trigger_event', ['no_customer_reply', 'scheduled_date', 'customer_birthday'])

  // Triggers à exécution UNIQUE : une fois déclenchés, on ne les rejoue plus.
  const ONCE = new Set(['scheduled_date'])

  let queued = 0
  for (const a of autos || []) {
    if (ONCE.has(a.trigger_event) && a.triggered_once_at) continue // déjà fait
    const trig = (a.graph?.nodes || []).find((n: { type: string }) => n.type === 'trigger') as
      | { event: string; inactivityHours?: number; scheduledAt?: string } | undefined
    if (!trig) continue
    if (a.trigger_event === 'no_customer_reply') queued += await handleNoReply(supabase, a, trig.inactivityHours ?? 24)
    else if (a.trigger_event === 'scheduled_date') queued += await handleScheduled(supabase, a, trig.scheduledAt, now)
    else if (a.trigger_event === 'customer_birthday') queued += await handleBirthday(supabase, a, today)
  }
  return { queued }
}

async function enqueue(supabase: SB, a: Auto, contactId: string, vars: Record<string, string>, dedup: string): Promise<boolean> {
  const { error } = await supabase.from('automation_jobs').insert({
    automation_id: a.id, user_id: a.user_id, contact_id: contactId,
    event_data: { variables: vars }, scheduled_at: new Date().toISOString(),
    status: 'pending', current_node_id: null, dedup_key: dedup,
  })
  return !error
}

async function sessionIdsOf(supabase: SB, userId: string): Promise<string[]> {
  const { data } = await supabase.from('whatsapp_sessions').select('id').eq('user_id', userId)
  return (data || []).map((s: { id: string }) => s.id)
}

async function handleNoReply(supabase: SB, a: Auto, hours: number): Promise<number> {
  const threshold = new Date(Date.now() - hours * 3600_000).toISOString()
  const sessionIds = await sessionIdsOf(supabase, a.user_id)
  if (!sessionIds.length) return 0
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, contact_id, last_message_at, contacts(name, opt_in_status, preferred_channel)')
    .in('session_id', sessionIds)
    .lt('last_message_at', threshold)
    .limit(200)
  let n = 0
  for (const c of convs || []) {
    const contact = c.contacts as { name?: string; opt_in_status?: string; preferred_channel?: string } | null
    if (!c.contact_id || contact?.opt_in_status === 'opted_out' || contact?.preferred_channel === 'none') continue
    const dedup = `noreply:${c.contact_id}:${new Date().toISOString().slice(0, 10)}`
    if (await enqueue(supabase, a, c.contact_id, { customer_first_name: (contact?.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}

async function handleScheduled(supabase: SB, a: Auto, scheduledAt: string | undefined, now: Date): Promise<number> {
  if (!scheduledAt) return 0
  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime()) || when > now) return 0
  const sessionIds = await sessionIdsOf(supabase, a.user_id)
  if (!sessionIds.length) return 0
  const { data: contacts } = await supabase
    .from('contacts').select('id, name, opt_in_status, preferred_channel')
    .in('session_id', sessionIds).eq('opt_in_status', 'subscribed').neq('preferred_channel', 'none').limit(500)
  let n = 0
  for (const ct of contacts || []) {
    const dedup = `sched:${a.id}:${scheduledAt}:${ct.id}`
    if (await enqueue(supabase, a, ct.id, { customer_first_name: (ct.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  // Date précise = envoi UNIQUE : on marque l'automatisation comme déclenchée
  // pour ne plus jamais la rejouer.
  await supabase.from('automations').update({ triggered_once_at: new Date().toISOString() }).eq('id', a.id)
  return n
}

async function handleBirthday(supabase: SB, a: Auto, today: string): Promise<number> {
  const mmdd = today.slice(5)
  const sessionIds = await sessionIdsOf(supabase, a.user_id)
  if (!sessionIds.length) return 0
  const { data: contacts } = await supabase
    .from('contacts').select('id, name, metadata, opt_in_status, preferred_channel')
    .in('session_id', sessionIds).eq('opt_in_status', 'subscribed').neq('preferred_channel', 'none').limit(1000)
  let n = 0
  for (const ct of contacts || []) {
    const bday = (ct.metadata as { birthday?: string } | null)?.birthday
    if (!bday || bday.slice(-5) !== mmdd) continue
    const dedup = `bday:${ct.id}:${today.slice(0, 4)}`
    if (await enqueue(supabase, a, ct.id, { customer_first_name: (ct.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}
