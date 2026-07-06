import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/automations — liste des automatisations de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automations')
    .select('id, name, trigger_event, trigger_button_text, template_id, delay_minutes, quiet_start, quiet_end, timezone, conditions, is_active, graph, builder_mode, folder_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/automations — créer une automatisation */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body.name?.trim() || !body.trigger_event) {
    return NextResponse.json({ error: 'Nom et événement requis' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automations')
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      trigger_event: body.trigger_event,
      trigger_button_text: body.trigger_event === 'button_clicked' ? (body.trigger_button_text?.trim() || null) : null,
      template_id: body.template_id || null,
      delay_minutes: Math.max(0, parseInt(body.delay_minutes, 10) || 0),
      quiet_start: body.quiet_start ?? null,
      quiet_end: body.quiet_end ?? null,
      timezone: body.timezone || 'Europe/Paris',
      conditions: body.conditions || {},
      is_active: body.is_active === true,
      folder_id: body.folder_id || null,
      // Le graphe du builder peut être fourni dès la création (wizard).
      graph: body.graph ?? null,
      builder_mode: body.graph ? true : (body.builder_mode === true),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
