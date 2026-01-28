import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/teams/join-code — Rejoindre une équipe via code */
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

  // Trouver l'équipe par code (cast pour éviter erreur de type avant migration)
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('join_code' as string, code)
    .single() as { data: { id: string; name: string } | null; error: Error | null }

  if (teamError || !team) {
    return NextResponse.json({ error: 'Code invalide' }, { status: 404 })
  }

  // Vérifier si déjà membre
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', team.id)
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Vous êtes déjà membre de cette équipe' }, { status: 409 })
  }

  // Ajouter comme membre
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: team.id,
      user_id: user.id,
      role: 'member',
      status: 'accepted',
    })
    .select()
    .single()

  if (memberError) {
    console.error('[JoinCode] Error:', memberError)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      team: { id: team.id, name: team.name },
      role: 'member',
    },
  })
}
