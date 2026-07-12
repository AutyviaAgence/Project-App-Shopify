import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** PATCH /api/automations/[id] — modifier (y compris activer/désactiver) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const k of ['name', 'trigger_event', 'trigger_button_text', 'template_id', 'delay_minutes', 'quiet_start', 'quiet_end', 'timezone', 'conditions', 'is_active', 'graph', 'builder_mode', 'folder_id', 'kind'] as const) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (updates.kind !== undefined && updates.kind !== 'marketing' && updates.kind !== 'transactional') delete updates.kind
  if (updates.delay_minutes !== undefined) updates.delay_minutes = Math.max(0, parseInt(String(updates.delay_minutes), 10) || 0)
  // Si on sauve un graphe, on synchronise trigger_event depuis le nœud trigger
  // (l'enqueue filtre les automatisations par trigger_event).
  if (updates.graph && typeof updates.graph === 'object') {
    const g = updates.graph as { nodes?: { type: string; event?: string; buttonText?: string; scheduledAt?: string }[] }
    const trig = g.nodes?.find((n) => n.type === 'trigger')
    if (trig?.event) updates.trigger_event = trig.event
    // button_clicked : remonter le libellé du bouton au niveau colonne (l'enqueue
    // filtre dessus). Vidé si le trigger n'est plus un clic de bouton.
    updates.trigger_button_text = trig?.event === 'button_clicked' ? (trig.buttonText?.trim() || null) : null
    updates.builder_mode = true
    // RÉ-ARMEMENT « date précise » : scheduled_date est un envoi UNIQUE, verrouillé
    // par triggered_once_at une fois parti. Si l'utilisateur repositionne la date
    // dans le FUTUR, on efface ce verrou pour que le cron le rejoue à la nouvelle
    // heure (sinon changer la date ne faisait rien). On ne ré-arme QUE si la date
    // est future (repositionner dans le passé n'a pas de sens).
    if (trig?.event === 'scheduled_date' && trig.scheduledAt) {
      const when = new Date(trig.scheduledAt)
      if (!Number.isNaN(when.getTime()) && when.getTime() > Date.now()) {
        updates.triggered_once_at = null
      }
    }
  }
  updates.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (u: Record<string, unknown>) => (supabase as any)
    .from('automations').update(u).eq('id', id).eq('user_id', user.id).select().single()

  let { data, error } = await upd(updates)
  // RÉSILIENCE migration : colonne kind pas encore là → on rejoue sans elle.
  if (error && updates.kind !== undefined && (error.code === '42703' || /kind/.test(error.message || ''))) {
    const { kind: _drop, ...rest } = updates
    void _drop
    ;({ data, error } = await upd(rest))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** DELETE /api/automations/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('automations').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
