import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTeamIds, canAccessResource } from '@/lib/teams/access'

/** PATCH /api/links/[id] — Modifier un lien WA */
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

  // Récupérer le lien actuel pour vérifier l'accès
  const { data: existingLink } = await supabase
    .from('wa_links')
    .select('*')
    .eq('id', id)
    .single()

  if (!existingLink) {
    return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  }

  // Vérifier l'accès au lien
  const hasAccess = await canAccessResource(supabase, user.id, existingLink.user_id, existingLink.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { name, pre_filled_message, tracking_source, slug, is_active, ai_agent_id, team_id, team_ids } = body as {
    name?: string
    pre_filled_message?: string
    tracking_source?: string
    slug?: string
    is_active?: boolean
    ai_agent_id?: string | null
    team_id?: string | null
    team_ids?: string[]
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (pre_filled_message !== undefined) updateData.pre_filled_message = pre_filled_message || null
  if (tracking_source !== undefined) updateData.tracking_source = tracking_source || null
  if (slug !== undefined) updateData.slug = slug.trim() || null
  if (is_active !== undefined) updateData.is_active = is_active
  if (ai_agent_id !== undefined) updateData.ai_agent_id = ai_agent_id

  // Gestion du changement d'équipes (multi-équipes)
  const selectedTeamIds = team_ids !== undefined ? team_ids : (team_id !== undefined ? (team_id ? [team_id] : []) : undefined)

  if (selectedTeamIds !== undefined) {
    if (existingLink.user_id !== user.id) {
      // Membre : vérifier que les team_ids sont identiques aux actuels (pas de changement d'équipe)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentTeamLinks } = await (supabase as any)
        .from('link_teams')
        .select('team_id')
        .eq('link_id', id)
      const currentTeamIds = (currentTeamLinks || []).map((t: { team_id: string }) => t.team_id).sort()
      const incomingTeamIds = [...selectedTeamIds].sort()
      const sameTeams = currentTeamIds.length === incomingTeamIds.length &&
        currentTeamIds.every((tid: string, i: number) => tid === incomingTeamIds[i])
      if (!sameTeams) {
        return NextResponse.json({ error: 'Seul le propriétaire peut changer les équipes' }, { status: 403 })
      }
      // Mêmes équipes → skip la mise à jour des équipes, continuer avec les autres champs
    } else {
      // Propriétaire : vérifier accès aux équipes spécifiées
      if (selectedTeamIds.length > 0) {
        const userTeamIds = await getUserTeamIds(supabase, user.id)
        const unauthorized = selectedTeamIds.filter(tid => !userTeamIds.includes(tid))
        if (unauthorized.length > 0) {
          return NextResponse.json({ error: 'Équipe(s) non autorisée(s)' }, { status: 403 })
        }
      }

      // Mettre à jour la table de liaison
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('link_teams').delete().eq('link_id', id)
      if (selectedTeamIds.length > 0) {
        const teamAssociations = selectedTeamIds.map(teamId => ({ link_id: id, team_id: teamId }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('link_teams').insert(teamAssociations)
      }

      // Legacy: garder le premier team_id pour compatibilité
      updateData.team_id = selectedTeamIds[0] || null
    }
  }

  // Mise à jour si nécessaire
  let link = existingLink
  if (Object.keys(updateData).length > 0) {
    const { data: updatedLink, error } = await supabase
      .from('wa_links')
      .update(updateData)
      .eq('id', id)
      .select('*, whatsapp_sessions(phone_number, instance_name, status)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updatedLink) {
      return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
    }
    link = updatedLink
  }

  return NextResponse.json({
    data: { ...link, team_ids: selectedTeamIds ?? (link.team_id ? [link.team_id] : []) }
  })
}

/** DELETE /api/links/[id] — Supprimer un lien WA */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { error } = await supabase
    .from('wa_links')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
