import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource, getUserTeamIds } from '@/lib/teams/access'

/** PATCH /api/conversations/[id]/agent — Assigner/désactiver un agent IA */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { ai_agent_id, is_ai_active } = body as {
    ai_agent_id?: string | null
    is_ai_active?: boolean
  }

  // Vérifier que la conversation existe
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer la session
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès (propriétaire ou membre de l'équipe)
  const hasAccess = await canAccessResource(supabase, user.id, session.user_id, session.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Si on assigne un agent, vérifier qu'il appartient à l'utilisateur ou à une équipe accessible
  if (ai_agent_id) {
    const teamIds = await getUserTeamIds(supabase, user.id)

    let agentQuery = supabase
      .from('ai_agents')
      .select('id, user_id, team_id')
      .eq('id', ai_agent_id)

    if (teamIds.length > 0) {
      agentQuery = agentQuery.or(`user_id.eq.${user.id},team_id.in.(${teamIds.join(',')})`)
    } else {
      agentQuery = agentQuery.eq('user_id', user.id)
    }

    const { data: agent } = await agentQuery.single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (ai_agent_id !== undefined) updateData.ai_agent_id = ai_agent_id
  if (is_ai_active !== undefined) updateData.is_ai_active = is_ai_active

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
