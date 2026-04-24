import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPlanQuota } from '@/lib/plan-quota'

/** GET /api/teams — Lister les équipes de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les memberships de l'utilisateur
  const { data: memberships, error: memberError } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .eq('status', 'accepted')

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Récupérer les équipes
  const teamIds = memberships.map((m) => m.team_id)
  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .in('id', teamIds)

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 })
  }

  // Combiner les données
  const teams = (teamsData || []).map((team) => {
    const membership = memberships.find((m) => m.team_id === team.id)
    return {
      ...team,
      my_role: membership?.role || 'member',
    }
  })

  return NextResponse.json({ data: teams })
}

/** POST /api/teams — Créer une nouvelle équipe */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, slug } = body as { name?: string; slug?: string }

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  }

  if (name.length > 100) {
    return NextResponse.json({ error: 'Nom trop long (max 100 caractères)' }, { status: 400 })
  }

  // Vérifier le quota d'équipes selon le plan
  const teamQuota = await checkPlanQuota(supabase, user.id, 'teams')
  if (!teamQuota.allowed) {
    const error = teamQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une équipe. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${teamQuota.plan} inclut ${teamQuota.limit} équipe(s). Passez à un plan supérieur pour en créer davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: teamQuota.reason,
      limit: teamQuota.limit,
      current: teamQuota.current,
    }, { status: 403 })
  }

  // Générer un slug si non fourni — normaliser pour éviter les collisions subtiles
  const finalSlug = slug?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || null

  // Créer l'équipe (le trigger ajoutera automatiquement l'owner comme membre)
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      name: name.trim(),
      slug: finalSlug,
      owner_id: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Le slug "${finalSlug}" est déjà utilisé. Essayez un autre nom.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...team, my_role: 'owner' } })
}
