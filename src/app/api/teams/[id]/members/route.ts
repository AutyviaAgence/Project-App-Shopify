import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamRole, isTeamAdmin } from '@/lib/teams/access'
import crypto from 'crypto'

/** GET /api/teams/[id]/members — Lister les membres d'une équipe */
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

  // Récupérer les membres avec leurs profils
  const { data: members, error } = await supabase
    .from('team_members')
    .select(`
      id,
      team_id,
      user_id,
      role,
      invited_email,
      invitation_token,
      status,
      created_at,
      profiles (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('team_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Masquer le token d'invitation pour les non-admin
  const isAdmin = role === 'owner' || role === 'admin'
  const formattedMembers = (members || []).map((m) => ({
    ...m,
    invitation_token: isAdmin && m.status === 'pending' ? m.invitation_token : null,
    profile: m.profiles,
  }))

  return NextResponse.json({ data: formattedMembers })
}

/** POST /api/teams/[id]/members — Créer un lien d'invitation (admin/owner uniquement) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin ou owner
  const isAdmin = await isTeamAdmin(supabase, user.id, id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { role = 'member', email } = body as { role?: 'admin' | 'member'; email?: string }

  // Valider le rôle
  if (role !== 'admin' && role !== 'member') {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
  }

  // Générer un token d'invitation unique
  const token = crypto.randomBytes(32).toString('hex')

  // Créer l'invitation
  const { data: invitation, error } = await supabase
    .from('team_members')
    .insert({
      team_id: id,
      role,
      invited_email: email?.trim() || null,
      invitation_token: token,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Construire l'URL d'invitation
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const invitationUrl = `${baseUrl}/api/teams/join/${token}`

  return NextResponse.json({
    data: {
      ...invitation,
      invitation_url: invitationUrl,
    },
  })
}
