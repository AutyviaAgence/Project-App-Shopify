import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamRole, isTeamOwner } from '@/lib/teams/access'

/** GET /api/teams/[id] — Détails d'une équipe */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier l'accès à l'équipe
  const role = await getTeamRole(supabase, user.id, id)
  if (!role) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer l'équipe
  const { data: team, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !team) {
    return NextResponse.json({ error: 'Équipe introuvable' }, { status: 404 })
  }

  return NextResponse.json({ data: { ...team, my_role: role } })
}

/** PATCH /api/teams/[id] — Modifier une équipe (admin/owner uniquement) */
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

  // Vérifier le rôle (admin ou owner requis)
  const role = await getTeamRole(supabase, user.id, id)
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { name, slug } = body as { name?: string; slug?: string }

  const updates: Record<string, string> = {}
  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    updates.name = name.trim()
  }
  if (slug !== undefined) {
    updates.slug = slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || ''
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const { data: team, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce slug est déjà utilisé' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...team, my_role: role } })
}

/** DELETE /api/teams/[id] — Supprimer une équipe (owner uniquement) */
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

  // Seul l'owner peut supprimer l'équipe
  const isOwner = await isTeamOwner(supabase, user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Seul le propriétaire peut supprimer l\'équipe' }, { status: 403 })
  }

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
