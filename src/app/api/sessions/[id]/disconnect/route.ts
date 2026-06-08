import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/sessions/[id]/disconnect — Déconnecter une session WABA */
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

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // WABA : marquer la session comme déconnectée
  await supabase
    .from('whatsapp_sessions')
    .update({ status: 'disconnected' })
    .eq('id', id)

  return NextResponse.json({ data: { status: 'disconnected' } })
}

/** DELETE /api/sessions/[id]/disconnect — Supprimer une session */
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

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Supprimer en BDD (CASCADE supprime contacts, conversations, messages)
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('id', id)

  return NextResponse.json({ data: { deleted: true } })
}
