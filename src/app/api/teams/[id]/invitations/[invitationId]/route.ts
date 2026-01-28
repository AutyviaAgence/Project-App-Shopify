import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** DELETE /api/teams/[id]/invitations/[invitationId] — Supprimer une invitation */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  const { id: teamId, invitationId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin de l'équipe
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .single()

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier que l'invitation existe et n'a pas été utilisée
  const { data: invitation } = await supabase
    .from('team_invitations')
    .select('id, used_by')
    .eq('id', invitationId)
    .eq('team_id', teamId)
    .single()

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 })
  }

  if (invitation.used_by) {
    return NextResponse.json({ error: 'Impossible de supprimer une invitation déjà utilisée' }, { status: 400 })
  }

  // Supprimer l'invitation
  const { error: deleteError } = await supabase
    .from('team_invitations')
    .delete()
    .eq('id', invitationId)

  if (deleteError) {
    console.error('[DeleteInvitation] Error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
