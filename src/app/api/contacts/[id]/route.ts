import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/contacts/[id] — Détail d'un contact */
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

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // Vérifier que la session appartient à l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', contact.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  return NextResponse.json({ data: contact })
}

/** PATCH /api/contacts/[id] — Modifier le profil d'un contact */
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

  const body = await req.json()
  const { first_name, last_name, email, notes } = body as {
    first_name?: string
    last_name?: string
    email?: string
    notes?: string
  }

  // Vérifier que le contact existe et appartient à l'utilisateur
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', contact.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const updateData: Record<string, unknown> = {}
  if (first_name !== undefined) updateData.first_name = first_name?.trim() || null
  if (last_name !== undefined) updateData.last_name = last_name?.trim() || null
  if (email !== undefined) updateData.email = email?.trim() || null
  if (notes !== undefined) updateData.notes = notes?.trim() || null

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

/** DELETE /api/contacts/[id] — Supprimer un contact et ses conversations/messages */
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

  // Vérifier que le contact existe
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id, phone_number')
    .eq('id', id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // Vérifier que la session appartient à l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', contact.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Supprimer le contact (les conversations et messages seront supprimés en cascade via FK)
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
