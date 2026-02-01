import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** GET /api/teams/[id]/invitations — Lister les invitations */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin/owner
  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .in('role', ['owner', 'admin'])
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { data: invitations, error } = await supabase
    .from('team_invitations')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: invitations })
}

/** POST /api/teams/[id]/invitations — Créer une invitation */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier que l'utilisateur est admin/owner
  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('status', 'accepted')
    .in('role', ['owner', 'admin'])
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const {
    role = 'member',
    allowed_session_ids,
    allowed_agent_ids,
    allowed_link_ids,
    allowed_campaign_ids,
  } = body as {
    role?: 'admin' | 'member'
    allowed_session_ids?: string[] | null
    allowed_agent_ids?: string[] | null
    allowed_link_ids?: string[] | null
    allowed_campaign_ids?: string[] | null
  }

  // Générer un code unique
  let code: string
  let attempts = 0
  do {
    code = generateCode()
    const { data: existing } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('code', code)
      .single()
    if (!existing) break
    attempts++
  } while (attempts < 10)

  if (attempts >= 10) {
    return NextResponse.json({ error: 'Impossible de générer un code unique' }, { status: 500 })
  }

  const { data: invitation, error } = await supabase
    .from('team_invitations')
    .insert({
      team_id: teamId,
      code,
      role: member.role === 'owner' ? role : 'member', // Seul le owner peut créer des admins
      allowed_session_ids: allowed_session_ids || null,
      allowed_agent_ids: allowed_agent_ids || null,
      allowed_link_ids: allowed_link_ids || null,
      allowed_campaign_ids: allowed_campaign_ids || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: invitation })
}
