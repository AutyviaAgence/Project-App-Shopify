import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'

/** PATCH /api/agents/[id]/qualifier-routes/[routeId] — Update a qualifier route */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; routeId: string }> }
) {
  const { id, routeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: agent } = await supabase
    .from('ai_agents')
    .select('user_id, team_id')
    .eq('id', id)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.description !== undefined) updateData.description = body.description.trim()
  if (body.priority !== undefined) updateData.priority = Math.max(0, Math.floor(Number(body.priority) || 0))
  if (body.is_active !== undefined) updateData.is_active = Boolean(body.is_active)
  if (body.target_agent_id !== undefined) {
    // Verify target agent access
    const { data: targetAgent } = await supabase
      .from('ai_agents')
      .select('id, user_id')
      .eq('id', body.target_agent_id)
      .single()

    if (!targetAgent) {
      return NextResponse.json({ error: 'Agent cible introuvable' }, { status: 404 })
    }
    const hasTargetAccess = await canAccessResource(supabase, user.id, targetAgent.user_id, null)
    if (!hasTargetAccess) {
      return NextResponse.json({ error: 'Accès non autorisé à l\'agent cible' }, { status: 403 })
    }
    updateData.target_agent_id = body.target_agent_id
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: route, error } = await (supabase as any)
    .from('qualifier_routes')
    .update(updateData)
    .eq('id', routeId)
    .eq('agent_id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: route })
}

/** DELETE /api/agents/[id]/qualifier-routes/[routeId] — Delete a qualifier route */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; routeId: string }> }
) {
  const { id, routeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: agent } = await supabase
    .from('ai_agents')
    .select('user_id, team_id')
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
  const { error } = await (supabase as any)
    .from('qualifier_routes')
    .delete()
    .eq('id', routeId)
    .eq('agent_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
