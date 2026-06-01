import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'

/** GET /api/agents/[id]/workflow — Charger le workflow d'un agent */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('user_id, team_id').eq('id', id).single()
  if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })

  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: workflow } = await (supabase as any)
    .from('agent_workflows')
    .select('*')
    .eq('agent_id', id)
    .single()

  return NextResponse.json({ data: workflow || { nodes: [], edges: [] } })
}

/** PUT /api/agents/[id]/workflow — Sauvegarder le workflow */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('user_id, team_id').eq('id', id).single()
  if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })

  if (agent.user_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { nodes, edges } = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('agent_workflows')
    .upsert(
      { agent_id: id, nodes: nodes || [], edges: edges || [] },
      { onConflict: 'agent_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** DELETE /api/agents/[id]/workflow — Supprimer le workflow */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: agent } = await supabase.from('ai_agents').select('user_id').eq('id', id).single()
  if (!agent || agent.user_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('agent_workflows').delete().eq('agent_id', id)
  return NextResponse.json({ success: true })
}
