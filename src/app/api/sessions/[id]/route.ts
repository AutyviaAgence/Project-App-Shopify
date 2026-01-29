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
  const { daily_ai_message_limit, team_id } = body as {
    daily_ai_message_limit?: number | null
    team_id?: string | null
  }

  const updateData: Record<string, unknown> = {}

  // Gestion de la limite quotidienne
  if (daily_ai_message_limit !== undefined) {
    updateData.daily_ai_message_limit = daily_ai_message_limit != null
      ? Math.max(1, Math.min(100000, Math.floor(daily_ai_message_limit)))
      : null
  }

  // Gestion du changement d'équipe
  if (team_id !== undefined) {
    // Seul le propriétaire de la session peut changer l'équipe
    if (existingSession.user_id !== user.id) {
      return NextResponse.json({ error: 'Seul le propriétaire peut changer l\'équipe' }, { status: 403 })
    }

    if (team_id) {
      // Vérifier que l'utilisateur a accès à la nouvelle équipe
      const userTeamIds = await getUserTeamIds(supabase, user.id)
      if (!userTeamIds.includes(team_id)) {
        return NextResponse.json({ error: 'Équipe non autorisée' }, { status: 403 })
      }
    }
    updateData.team_id = team_id || null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: session })
}
