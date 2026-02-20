import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'

/** POST /api/links/[id]/reset-clicks — Réinitialiser le compteur de clics */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le lien pour vérifier l'accès
  const { data: link } = await supabase
    .from('wa_links')
    .select('id, user_id, team_id')
    .eq('id', id)
    .single()

  if (!link) {
    return NextResponse.json({ error: 'Lien introuvable' }, { status: 404 })
  }

  const hasAccess = await canAccessResource(supabase, user.id, link.user_id, link.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Remettre le compteur à 0
  const { error: updateError } = await supabase
    .from('wa_links')
    .update({ click_count: 0 })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Supprimer l'historique des clics (admin client pour bypass RLS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminSb = await createAdminClient() as any
  await adminSb.from('link_clicks').delete().eq('link_id', id)

  return NextResponse.json({ ok: true })
}
