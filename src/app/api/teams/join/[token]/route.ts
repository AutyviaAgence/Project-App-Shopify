import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

/** GET /api/teams/join/[token] — Récupérer les infos de l'invitation */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit to prevent token brute-force
  const rateLimitResponse = checkRateLimit(_req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

  const { token } = await params
  const supabase = await createClient()

  // Récupérer l'invitation avec l'équipe
  const { data: invitation, error } = await supabase
    .from('team_members')
    .select(`
      id,
      role,
      status,
      teams (
        id,
        name,
        slug
      )
    `)
    .eq('invitation_token', token)
    .eq('status', 'pending')
    .single()

  if (error || !invitation) {
    return NextResponse.json({ error: 'Invitation introuvable ou expirée' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      team: invitation.teams,
      role: invitation.role,
    },
  })
}

/** POST /api/teams/join/[token] — Rejoindre une équipe via lien d'invitation */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit to prevent token brute-force
  const rateLimitResponse = checkRateLimit(_req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

  const { token } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer l'invitation
  const { data: invitation, error: invError } = await supabase
    .from('team_members')
    .select('*, teams(id, name)')
    .eq('invitation_token', token)
    .eq('status', 'pending')
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: 'Invitation introuvable ou expirée' }, { status: 404 })
  }

  // Vérifier si l'utilisateur n'est pas déjà membre
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

  // Accepter l'invitation : mettre à jour le membre
  const { data: member, error } = await supabase
    .from('team_members')
    .update({
      user_id: user.id,
      status: 'accepted',
      invitation_token: null, // Invalider le token
    })
    .eq('id', invitation.id)
    .select('*, teams(id, name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      team: member.teams,
      role: member.role,
    },
  })
}
