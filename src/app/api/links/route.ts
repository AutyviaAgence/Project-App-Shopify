import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, getUserTeamPermissions, buildAccessFilter, filterLinksByPermissions } from '@/lib/teams/access'
import type { WALink } from '@/types/database'

/** GET /api/links — Lister les liens WA de l'utilisateur (+ équipes avec permissions) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer les équipes et permissions de l'utilisateur
  const [teamIds, permissions] = await Promise.all([
    getUserTeamIds(supabase, user.id),
    getUserTeamPermissions(supabase, user.id)
  ])

  // Récupérer les liens avec les sessions associées
  const { data: allLinks, error } = await supabase
    .from('wa_links')
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .or(buildAccessFilter(user.id, teamIds))
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filtrer selon les permissions granulaires
  const links = filterLinksByPermissions(
    (allLinks || []) as (WALink & { id: string; user_id: string; team_id: string | null })[],
    user.id,
    permissions
  )

  // Récupérer les team_ids pour chaque lien depuis la table de liaison
  if (links && links.length > 0) {
    const linkIds = links.map(l => l.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: linkTeams } = await (supabase as any)
      .from('link_teams')
      .select('link_id, team_id')
      .in('link_id', linkIds)

    // Créer une map link_id -> team_ids
    const teamsByLink = new Map<string, string[]>()
    if (linkTeams) {
      for (const lt of linkTeams as { link_id: string; team_id: string }[]) {
        const existing = teamsByLink.get(lt.link_id) || []
        existing.push(lt.team_id)
        teamsByLink.set(lt.link_id, existing)
      }
    }

    // Ajouter team_ids à chaque lien
    const linksWithTeamIds = links.map(link => ({
      ...link,
      team_ids: teamsByLink.get(link.id) || (link.team_id ? [link.team_id] : [])
    }))

    return NextResponse.json({ data: linksWithTeamIds })
  }

  return NextResponse.json({ data: links })
}

/** POST /api/links — Créer un nouveau lien WA */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, session_id, pre_filled_message, tracking_source, slug, ai_agent_id, team_id, team_ids: bodyTeamIds } = body as {
    name?: string
    session_id?: string
    pre_filled_message?: string
    tracking_source?: string
    slug?: string
    ai_agent_id?: string | null
    team_id?: string
    team_ids?: string[]
  }

  // Support multi-équipes: team_ids ou team_id (legacy)
  const selectedTeamIds = bodyTeamIds || (team_id ? [team_id] : [])

  if (!name || !session_id) {
    return NextResponse.json({ error: 'Nom et session requis' }, { status: 400 })
  }

  // Récupérer les équipes de l'utilisateur
  const userTeamIds = await getUserTeamIds(supabase, user.id)

  // Vérifier que l'utilisateur a accès à toutes les équipes spécifiées
  if (selectedTeamIds.length > 0) {
    const unauthorized = selectedTeamIds.filter(tid => !userTeamIds.includes(tid))
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
    }
  }

  // Vérifier que la session appartient à l'utilisateur ou à une de ses équipes
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', session_id)
    .or(buildAccessFilter(user.id, userTeamIds))
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Générer un slug si non fourni
  const finalSlug = slug?.trim() || Math.random().toString(36).substring(2, 10)

  const { data: link, error } = await supabase
    .from('wa_links')
    .insert({
      user_id: user.id,
      team_id: selectedTeamIds[0] || null, // Legacy: premier team_id
      session_id,
      name,
      slug: finalSlug,
      pre_filled_message: pre_filled_message || null,
      tracking_source: tracking_source || null,
      ai_agent_id: ai_agent_id || null,
    })
    .select('*, whatsapp_sessions(phone_number, instance_name, status)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Créer les associations multi-équipes
  if (selectedTeamIds.length > 0 && link) {
    const teamAssociations = selectedTeamIds.map(teamId => ({
      link_id: link.id,
      team_id: teamId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('link_teams').insert(teamAssociations)
  }

  return NextResponse.json({ data: { ...link, team_ids: selectedTeamIds } })
}
