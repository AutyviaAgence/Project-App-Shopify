import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evolution } from '@/lib/evolution/client'

/** POST /api/sessions/[id]/disconnect — Déconnecter une session */
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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Déconnecter sur Evolution API (seulement pour les sessions Evolution)
  if (session.integration_type !== 'waba') {
    await evolution.disconnect(session.instance_name)
  }

  // Mettre à jour en BDD
  await supabase
    .from('whatsapp_sessions')
    .update({ status: 'disconnected', qr_code: null, pairing_code: null })
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
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (dbError || !session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Supprimer sur Evolution API (seulement pour les sessions Evolution)
  if (session.integration_type !== 'waba') {
    await evolution.disconnect(session.instance_name)
    await evolution.deleteInstance(session.instance_name)
  }

  // Supprimer en BDD (CASCADE supprime contacts, conversations, messages)
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('id', id)

  return NextResponse.json({ data: { deleted: true } })
}
