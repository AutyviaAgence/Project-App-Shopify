import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, getUserTeamPermissions } from '@/lib/teams/access'

/** GET /api/conversations/[id] — Récupérer une conversation par son ID */
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

  // Récupérer la conversation
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer la session pour vérifier l'accès
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès
  const teamIds = await getUserTeamIds(supabase, user.id)
  const permissions = await getUserTeamPermissions(supabase, user.id)

  // Vérifier si l'utilisateur a accès à cette session
  const isOwner = session.user_id === user.id
  const isTeamMember = session.team_id && teamIds.includes(session.team_id)

  if (!isOwner && !isTeamMember) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier la permission can_view_messages pour les membres d'équipe
  if (!isOwner && session.team_id) {
    const memberPerm = permissions.find((p) => p.team_id === session.team_id)
    if (!memberPerm) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    // Owner/Admin ont toujours accès
    if (memberPerm.role !== 'owner' && memberPerm.role !== 'admin') {
      if (!memberPerm.can_view_messages) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
      }
    }
  }

  // Récupérer le contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conversation.contact_id)
    .single()

  // Récupérer le nom de l'équipe si applicable
  let teamName: string | null = null
  if (session.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', session.team_id)
      .single()
    teamName = team?.name || null
  }

  return NextResponse.json({
    data: {
      ...conversation,
      contact: contact || null,
      session: {
        id: session.id,
        instance_name: session.instance_name,
        phone_number: session.phone_number,
        team_id: session.team_id || null,
        team_name: teamName,
      },
    },
  })
}

/** PATCH /api/conversations/[id] — Toggle pin */
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
  const { is_pinned } = body

  if (typeof is_pinned !== 'boolean') {
    return NextResponse.json({ error: 'is_pinned requis (boolean)' }, { status: 400 })
  }

  // Vérifier que la conversation existe et que l'utilisateur y a accès
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('user_id, team_id')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  const teamIds = await getUserTeamIds(supabase, user.id)
  const isOwner = session.user_id === user.id
  const isTeamMember = session.team_id && teamIds.includes(session.team_id)

  if (!isOwner && !isTeamMember) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update({ is_pinned })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
