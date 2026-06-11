import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/sessions/[id]/contacts — List contacts for a session */
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

  // Verify session access (owner only)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, phone_number, name, first_name, last_name')
    .eq('session_id', id)
    .order('name', { ascending: true, nullsFirst: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: contacts || [] })
}
