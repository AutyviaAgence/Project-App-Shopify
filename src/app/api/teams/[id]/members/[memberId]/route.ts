import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamRole, isTeamAdmin, isTeamOwner } from '@/lib/teams/access'

/** PATCH /api/teams/[id]/members/[memberId] — Modifier le rôle et/ou permissions d'un membre */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin ou owner
  const userRole = await getTeamRole(supabase, user.id, id)
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer le membre cible
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', memberId)
    .eq('team_id', id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  }

  // Impossible de modifier le owner
  if (member.role === 'owner') {
    return NextResponse.json({ error: 'Impossible de modifier le propriétaire' }, { status: 403 })
  }

  // Seul l'owner peut promouvoir/rétrograder les admins
  if (member.role === 'admin' && userRole !== 'owner') {
    return NextResponse.json({ error: 'Seul le propriétaire peut modifier les administrateurs' }, { status: 403 })
  }

  const body = await req.json()
  const {
    role,
    allowed_session_ids,
    allowed_agent_ids,
    allowed_link_ids,
    // Nouvelles permissions granulaires
    can_view_stats,
    can_view_knowledge,
    can_view_messages,
    can_manage_sessions,
    can_manage_agents,
    can_manage_knowledge,
    can_manage_links,
    can_send_messages,
  } = body as {
    role?: 'admin' | 'member'
    allowed_session_ids?: string[] | null
    allowed_agent_ids?: string[] | null
    allowed_link_ids?: string[] | null
    can_view_stats?: boolean
    can_view_knowledge?: boolean
    can_view_messages?: boolean
    can_manage_sessions?: boolean
    can_manage_agents?: boolean
    can_manage_knowledge?: boolean
    can_manage_links?: boolean
    can_send_messages?: boolean
  }

  // Construire l'objet de mise à jour
  const updateData: Record<string, unknown> = {}

  // Gestion du rôle
  if (role !== undefined) {
    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
    }
    // Seul l'owner peut promouvoir en admin
    if (role === 'admin' && userRole !== 'owner') {
      return NextResponse.json({ error: 'Seul le propriétaire peut promouvoir en administrateur' }, { status: 403 })
    }
    updateData.role = role
  }

  // Gestion des permissions de ressources (null = accès à tout, [] = aucun accès, [...] = accès limité)
  if (allowed_session_ids !== undefined) {
    updateData.allowed_session_ids = allowed_session_ids
  }
  if (allowed_agent_ids !== undefined) {
    updateData.allowed_agent_ids = allowed_agent_ids
  }
  if (allowed_link_ids !== undefined) {
    updateData.allowed_link_ids = allowed_link_ids
  }

  // Gestion des permissions granulaires (lecture/écriture)
  if (can_view_stats !== undefined) {
    updateData.can_view_stats = can_view_stats
  }
  if (can_view_knowledge !== undefined) {
    updateData.can_view_knowledge = can_view_knowledge
  }
  if (can_view_messages !== undefined) {
    updateData.can_view_messages = can_view_messages
  }
  if (can_manage_sessions !== undefined) {
    updateData.can_manage_sessions = can_manage_sessions
  }
  if (can_manage_agents !== undefined) {
    updateData.can_manage_agents = can_manage_agents
  }
  if (can_manage_knowledge !== undefined) {
    updateData.can_manage_knowledge = can_manage_knowledge
  }
  if (can_manage_links !== undefined) {
    updateData.can_manage_links = can_manage_links
  }
  if (can_send_messages !== undefined) {
    updateData.can_send_messages = can_send_messages
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Aucune modification fournie' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('team_members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

/** DELETE /api/teams/[id]/members/[memberId] — Retirer un membre de l'équipe */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le membre cible
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', memberId)
    .eq('team_id', id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  }

  // Impossible de supprimer le owner
  if (member.role === 'owner') {
    return NextResponse.json({ error: 'Impossible de retirer le propriétaire' }, { status: 403 })
  }

  // Un membre peut se retirer lui-même
  const isSelf = member.user_id === user.id

  if (!isSelf) {
    // Vérifier que l'utilisateur est admin ou owner
    const isAdmin = await isTeamAdmin(supabase, user.id, id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Seul l'owner peut retirer les admins
    if (member.role === 'admin') {
      const isOwner = await isTeamOwner(supabase, user.id, id)
      if (!isOwner) {
        return NextResponse.json({ error: 'Seul le propriétaire peut retirer les administrateurs' }, { status: 403 })
      }
    }
  }

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
