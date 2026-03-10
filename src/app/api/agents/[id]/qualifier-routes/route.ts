import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'

/** GET /api/agents/[id]/qualifier-routes — List qualifier routes for an agent */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify agent access
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('user_id, team_id, agent_type')
    .eq('id', id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: routes, error } = await (supabase as any)
    .from('qualifier_routes')
    .select('*, target_agent:ai_agents!qualifier_routes_target_agent_id_fkey(id, name, description, agent_type)')
    .eq('agent_id', id)
    .order('priority', { ascending: true })

  if (error) {
    // Fallback without join if FK name doesn't match
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: routesSimple, error: err2 } = await (supabase as any)
      .from('qualifier_routes')
      .select('*')
      .eq('agent_id', id)
      .order('priority', { ascending: true })

    if (err2) {
      return NextResponse.json({ error: err2.message }, { status: 500 })
    }
    return NextResponse.json({ data: routesSimple || [] })
  }

  return NextResponse.json({ data: routes || [] })
}

/** POST /api/agents/[id]/qualifier-routes — Create a qualifier route */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify agent access and type
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('user_id, team_id, agent_type')
    .eq('id', id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  if (agent.agent_type !== 'qualifier') {
    return NextResponse.json({ error: "L'agent doit être de type 'qualifier'" }, { status: 400 })
  }

  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { target_agent_id, name, description, priority } = body as {
    target_agent_id: string
    name: string
    description: string
    priority?: number
  }

  if (!target_agent_id || !name?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'target_agent_id, name et description requis' }, { status: 400 })
  }

  // Verify target agent belongs to same user
  const { data: targetAgent } = await supabase
    .from('ai_agents')
    .select('id, user_id')
    .eq('id', target_agent_id)
    .single()

  if (!targetAgent) {
    return NextResponse.json({ error: 'Agent cible introuvable' }, { status: 404 })
  }

  const hasTargetAccess = await canAccessResource(supabase, user.id, targetAgent.user_id, null)
  if (!hasTargetAccess) {
    return NextResponse.json({ error: 'Accès non autorisé à l\'agent cible' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: route, error } = await (supabase as any)
    .from('qualifier_routes')
    .insert({
      agent_id: id,
      target_agent_id,
      name: name.trim(),
      description: description.trim(),
      priority: priority ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: route }, { status: 201 })
}
