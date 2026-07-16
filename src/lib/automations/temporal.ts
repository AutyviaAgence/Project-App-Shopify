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

/**
 * « Pas de réponse client » depuis X heures.
 *
 * ⚠️ ON REGARDE LE DERNIER MESSAGE *ENTRANT*, PAS `last_message_at`.
 *
 * Le bug : `last_message_at` est réécrit à CHAQUE message, y compris ceux que
 * NOUS envoyons (dispatch.ts). Le trigger cherchait donc des conversations
 * « inactives » dont notre propre envoi venait de repousser l'horodatage — il ne
 * se déclenchait quasiment jamais. Or la question posée est « le CLIENT
 * a-t-il répondu ? » : seul un message entrant y répond.
 *
 * On lit donc `messages` (direction='inbound'), qui est la source de vérité, au
 * lieu d'ajouter une colonne dénormalisée de plus à tenir synchronisée.
 */
async function handleNoReply(supabase: SB, a: Auto, hours: number): Promise<number> {
  const threshold = new Date(Date.now() - hours * 3600_000).toISOString()
  const sessionIds = await sessionIdsOf(supabase, a.user_id)
  if (!sessionIds.length) return 0

  // Conversations candidates : aucune activité (entrante OU sortante) récente.
  // Ce premier filtre est large mais indexé ; on affine ensuite sur l'entrant.
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, contact_id, last_message_at, contacts(name, opt_in_status, preferred_channel)')
    .in('session_id', sessionIds)
    .lt('last_message_at', threshold)
    .limit(200)
  if (!convs?.length) return 0

  // Dernier message ENTRANT de chaque conversation candidate.
  const convIds = convs.map((c: { id: string }) => c.id)
  const { data: inbound } = await supabase
    .from('messages')
    .select('conversation_id, created_at')
    .in('conversation_id', convIds)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
  const lastInbound = new Map<string, string>()
  for (const m of inbound || []) {
    if (!lastInbound.has(m.conversation_id)) lastInbound.set(m.conversation_id, m.created_at)
  }

  let n = 0
  for (const c of convs) {
    const contact = c.contacts as { name?: string; opt_in_status?: string; preferred_channel?: string } | null
    if (!c.contact_id || contact?.opt_in_status === 'opted_out' || contact?.preferred_channel === 'none') continue

    // Le client a-t-il parlé récemment ? Si oui, il a répondu : on ne relance pas.
    // Jamais parlé (aucun entrant) → le silence compte depuis la conversation.
    const since = lastInbound.get(c.id)
    if (since && since >= threshold) continue

    // ⚠️ La dédup inclut `a.id` : sans lui, deux automatisations « pas de réponse »
    // du même marchand s'écrasaient l'une l'autre (contrainte d'unicité), et la
    // seconde ne partait jamais.
    const dedup = `noreply:${a.id}:${c.contact_id}:${new Date().toISOString().slice(0, 10)}`
    if (await enqueue(supabase, a, c.contact_id, { customer_first_name: (contact?.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}

/**
 * Rattrapage maximal d'une « date précise ».
 *
 * ⚠️ CE PLANCHER EST UN GARDE-FOU, PAS UN CONFORT.
 *
 * Avant, la seule condition était `when > now` : une date DÉJÀ PASSÉE la
 * franchissait et partait à l'instant, vers les 500 contacts. Se tromper d'année
 * en saisissant (2025 au lieu de 2026) suffisait à arroser toute la base
 * immédiatement, sans rien pour l'arrêter.
 *
 * Une date passée n'est donc plus jamais envoyée. La fenêtre ne sert qu'au
 * retard NORMAL du cron (il tourne toutes les quelques minutes, pas à la
 * seconde) : au-delà, c'est une erreur de saisie, pas un retard.
 */
const SCHEDULED_CATCHUP_MS = 60 * 60_000 // 1 h

async function handleScheduled(supabase: SB, a: Auto, scheduledAt: string | undefined, now: Date): Promise<number> {
  if (!scheduledAt) return 0
  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime())) return 0
  // Pas encore l'heure → on repassera au prochain tick.
  if (when > now) return 0
  // Trop tard → on n'envoie RIEN, et on neutralise l'automatisation pour qu'elle
  // ne reste pas à guetter indéfiniment une date qui ne reviendra pas.
  if (now.getTime() - when.getTime() > SCHEDULED_CATCHUP_MS) {
    await supabase.from('automations')
      .update({ triggered_once_at: new Date().toISOString() })
      .eq('id', a.id)
    console.warn(`[temporal] scheduled_date ignoré (date passée de plus d'1h): auto=${a.id} when=${scheduledAt}`)
    return 0
  }
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
