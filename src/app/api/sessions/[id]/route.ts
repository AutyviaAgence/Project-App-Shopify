import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, canAccessResource } from '@/lib/teams/access'

/** PATCH /api/sessions/[id] — Modifier les paramètres d'une session */
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

  // Récupérer la session actuelle pour vérifier l'accès
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (!existingSession) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès à la session
  const hasAccess = await canAccessResource(supabase, user.id, existingSession.user_id, existingSession.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { display_name, daily_ai_message_limit, ai_message_delay, qualifier_agent_id, team_id, team_ids } = body as {
    display_name?: string | null
    daily_ai_message_limit?: number | null
    ai_message_delay?: number | null
    qualifier_agent_id?: string | null
    team_id?: string | null
    team_ids?: string[]
  }

  const updateData: Record<string, unknown> = {}

  // Gestion du nom d'affichage
  if (display_name !== undefined) {
    updateData.display_name = display_name?.trim() || null
  }

  // Gestion de la limite quotidienne
  if (daily_ai_message_limit !== undefined) {
    updateData.daily_ai_message_limit = daily_ai_message_limit != null
      ? Math.max(1, Math.min(100000, Math.floor(daily_ai_message_limit)))
      : null
  }

  // Gestion du délai entre envois automatiques
  if (ai_message_delay !== undefined) {
    updateData.ai_message_delay = ai_message_delay != null
      ? Math.max(1, Math.min(60, Math.floor(ai_message_delay)))
      : null
  }

  // Gestion du qualifier agent
  if (qualifier_agent_id !== undefined) {
    updateData.qualifier_agent_id = qualifier_agent_id || null
  }

  // Gestion du changement d'équipes (multi-équipes)
  const selectedTeamIds = team_ids !== undefined ? team_ids : (team_id !== undefined ? (team_id ? [team_id] : []) : undefined)

  if (selectedTeamIds !== undefined) {
    // Seul le propriétaire de la session peut changer les équipes
    if (existingSession.user_id !== user.id) {
      return NextResponse.json({ error: 'Seul le propriétaire peut changer les équipes' }, { status: 403 })
    }

    // Vérifier que l'utilisateur a accès aux équipes spécifiées
    if (selectedTeamIds.length > 0) {
      const userTeamIds = await getUserTeamIds(supabase, user.id)
      const unauthorized = selectedTeamIds.filter(tid => !userTeamIds.includes(tid))
      if (unauthorized.length > 0) {
        return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
      }
    }

    // Mettre à jour la table de liaison
    // 1. Supprimer les anciennes associations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('session_teams').delete().eq('session_id', id)

    // 2. Créer les nouvelles associations
    if (selectedTeamIds.length > 0) {
      const teamAssociations = selectedTeamIds.map(teamId => ({
        session_id: id,
        team_id: teamId,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('session_teams').insert(teamAssociations)
    }

    // Legacy: garder le premier team_id pour compatibilité
    updateData.team_id = selectedTeamIds[0] || null
  }

  // Mise à jour si nécessaire
  let session = existingSession
  if (Object.keys(updateData).length > 0) {
    const { data: updatedSession, error } = await supabase
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    session = updatedSession
  }

  return NextResponse.json({
    data: { ...session, team_ids: selectedTeamIds ?? (session.team_id ? [session.team_id] : []) }
  })
}
