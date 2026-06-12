import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * Cron — déclencheurs TEMPORELS (pas issus d'un webhook Shopify) :
 *   - no_customer_reply  : conversations sans réponse depuis X heures (relance SAV)
 *   - scheduled_date      : à une date/heure précise (campagne planifiée)
 *   - customer_birthday   : le jour de l'anniversaire du client
 *
 * Pour chaque automatisation active correspondante, on enfile un automation_job
 * (que le cron run-automations exécutera ensuite). L'idempotence (dedup_key)
 * évite les doublons : 1 envoi par contact et par "tranche" (jour / date).
 *
 * À appeler ~toutes les heures avec Authorization: Bearer CRON_SECRET.
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
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD

  // Automatisations actives en mode builder, avec un trigger temporel.
  const { data: autos } = await supabase
    .from('automations')
    .select('id, user_id, trigger_event, graph')
    .eq('is_active', true)
    .eq('builder_mode', true)
    .in('trigger_event', ['no_customer_reply', 'scheduled_date', 'customer_birthday'])

  let queued = 0

  for (const a of autos || []) {
    const trig = (a.graph?.nodes || []).find((n: { type: string }) => n.type === 'trigger') as
      | { event: string; inactivityHours?: number; scheduledAt?: string } | undefined
    if (!trig) continue

    if (a.trigger_event === 'no_customer_reply') {
      queued += await handleNoReply(supabase, a, trig.inactivityHours ?? 24)
    } else if (a.trigger_event === 'scheduled_date') {
      queued += await handleScheduled(supabase, a, trig.scheduledAt, now)
    } else if (a.trigger_event === 'customer_birthday') {
      queued += await handleBirthday(supabase, a, today)
    }
  }

  return NextResponse.json({ ok: true, queued })
}

type Auto = { id: string; user_id: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

async function enqueue(supabase: SB, a: Auto, contactId: string, vars: Record<string, string>, dedup: string): Promise<boolean> {
  const { error } = await supabase.from('automation_jobs').insert({
    automation_id: a.id,
    user_id: a.user_id,
    contact_id: contactId,
    event_data: { variables: vars },
    scheduled_at: new Date().toISOString(),
    status: 'pending',
    current_node_id: null,
    dedup_key: dedup,
  })
  return !error // doublon (23505) → false, ignoré
}

/** Conversations sans réponse depuis X heures → relance. */
async function handleNoReply(supabase: SB, a: Auto, hours: number): Promise<number> {
  const threshold = new Date(Date.now() - hours * 3600_000).toISOString()
  // Sessions de l'utilisateur
  const { data: sessions } = await supabase.from('whatsapp_sessions').select('id').eq('user_id', a.user_id)
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  if (!sessionIds.length) return 0

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, contact_id, last_message_at, contacts(name, phone_number, opt_in_status, preferred_channel)')
    .in('session_id', sessionIds)
    .lt('last_message_at', threshold)
    .limit(200)

  let n = 0
  for (const c of convs || []) {
    const contact = c.contacts as { name?: string; opt_in_status?: string; preferred_channel?: string } | null
    if (!c.contact_id || contact?.opt_in_status === 'opted_out' || contact?.preferred_channel === 'none') continue
    // dedup par jour : 1 relance / contact / jour max
    const dedup = `noreply:${c.contact_id}:${new Date().toISOString().slice(0, 10)}`
    if (await enqueue(supabase, a, c.contact_id, { customer_first_name: (contact?.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}

/** Date précise atteinte → envoyer à tous les contacts opt-in une fois. */
async function handleScheduled(supabase: SB, a: Auto, scheduledAt: string | undefined, now: Date): Promise<number> {
  if (!scheduledAt) return 0
  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime()) || when > now) return 0 // pas encore l'heure
  // On ne déclenche qu'une fois (dedup global sur la date).
  const { data: sessions } = await supabase.from('whatsapp_sessions').select('id').eq('user_id', a.user_id)
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  if (!sessionIds.length) return 0

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, opt_in_status, preferred_channel')
    .in('session_id', sessionIds)
    .eq('opt_in_status', 'subscribed')
    .neq('preferred_channel', 'none')
    .limit(500)

  let n = 0
  for (const ct of contacts || []) {
    const dedup = `sched:${a.id}:${scheduledAt}:${ct.id}`
    if (await enqueue(supabase, a, ct.id, { customer_first_name: (ct.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}

/** Anniversaire du jour (MM-DD) lu depuis contacts.metadata.birthday. */
async function handleBirthday(supabase: SB, a: Auto, today: string): Promise<number> {
  const mmdd = today.slice(5) // MM-DD
  const { data: sessions } = await supabase.from('whatsapp_sessions').select('id').eq('user_id', a.user_id)
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  if (!sessionIds.length) return 0

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, metadata, opt_in_status, preferred_channel')
    .in('session_id', sessionIds)
    .eq('opt_in_status', 'subscribed')
    .neq('preferred_channel', 'none')
    .limit(1000)

  let n = 0
  for (const ct of contacts || []) {
    const bday = (ct.metadata as { birthday?: string } | null)?.birthday // attendu "YYYY-MM-DD" ou "MM-DD"
    if (!bday) continue
    if (bday.slice(-5) !== mmdd) continue
    const dedup = `bday:${ct.id}:${today.slice(0, 4)}` // 1x par an
    if (await enqueue(supabase, a, ct.id, { customer_first_name: (ct.name || '').split(' ')[0] || '' }, dedup)) n++
  }
  return n
}
