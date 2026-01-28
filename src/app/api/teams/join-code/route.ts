import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/teams/join-code — Rejoindre une équipe via code d'invitation */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const code = (body.code as string)?.trim().toUpperCase()

  if (!code) {
    return NextResponse.json({ error: 'Code requis' }, { status: 400 })
  }

  // Trouver l'invitation par code
  const { data: invitation, error: invError } = await supabase
    .from('team_invitations')
    .select('*')
    .eq('code', code)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: 'Code invalide' }, { status: 404 })
  }

  // Récupérer l'équipe
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', invitation.team_id)
    .single()

  if (teamError || !team) {
    return NextResponse.json({ error: 'Équipe introuvable' }, { status: 404 })
  }

  // Vérifier si le code a déjà été utilisé
  if (invitation.used_by) {
    return NextResponse.json({ error: 'Ce code a déjà été utilisé' }, { status: 410 })
  }

  // Vérifier si le code a expiré
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Ce code a expiré' }, { status: 410 })
  }

  // Vérifier si déjà membre
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', invitation.team_id)
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Vous êtes déjà membre de cette équipe' }, { status: 409 })
  }

  // Ajouter comme membre avec les permissions
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: invitation.team_id,
      user_id: user.id,
      role: invitation.role,
      status: 'accepted',
      allowed_session_ids: invitation.allowed_session_ids,
      allowed_agent_ids: invitation.allowed_agent_ids,
      allowed_link_ids: invitation.allowed_link_ids,
    })

  if (memberError) {
    console.error('[JoinCode] Member insert error:', memberError)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Marquer l'invitation comme utilisée
  await supabase
    .from('team_invitations')
    .update({
      used_by: user.id,
      used_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  return NextResponse.json({
    data: {
      team: { id: team.id, name: team.name },
      role: invitation.role,
      permissions: {
        sessions: invitation.allowed_session_ids,
        agents: invitation.allowed_agent_ids,
        links: invitation.allowed_link_ids,
      },
    },
  })
}
