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
  for (const k of ['name', 'trigger_event', 'template_id', 'delay_minutes', 'quiet_start', 'quiet_end', 'timezone', 'conditions', 'is_active', 'graph', 'builder_mode'] as const) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (updates.delay_minutes !== undefined) updates.delay_minutes = Math.max(0, parseInt(String(updates.delay_minutes), 10) || 0)
  // Si on sauve un graphe, on synchronise trigger_event depuis le nœud trigger
  // (l'enqueue filtre les automatisations par trigger_event).
  if (updates.graph && typeof updates.graph === 'object') {
    const g = updates.graph as { nodes?: { type: string; event?: string }[] }
    const trig = g.nodes?.find((n) => n.type === 'trigger')
    if (trig?.event) updates.trigger_event = trig.event
    updates.builder_mode = true
  }
  updates.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automations')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

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
