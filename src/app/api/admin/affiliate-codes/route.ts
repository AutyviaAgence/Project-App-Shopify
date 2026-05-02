import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = getAdmin()

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { data } = await (adminSupabase as any)
    .from('affiliate_codes')
    .select('*, profiles!affiliate_codes_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = getAdmin()

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { user_id, user_email, code, commission_percent } = body

  if ((!user_id && !user_email) || !code || !commission_percent) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  // Resolve email → user_id if email provided
  let resolvedUserId = user_id
  if (!resolvedUserId && user_email) {
    const { data: found } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', user_email.toLowerCase().trim())
      .single() as { data: { id: string } | null }
    if (!found) return NextResponse.json({ error: `Aucun compte trouvé pour ${user_email}` }, { status: 404 })
    resolvedUserId = found.id
  }

  const { data, error } = await (adminSupabase as any)
    .from('affiliate_codes')
    .insert({
      user_id: resolvedUserId,
      code: code.toUpperCase(),
      commission_percent: Number(commission_percent),
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(data)
}
