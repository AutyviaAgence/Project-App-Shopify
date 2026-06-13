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

  // Récupérer les sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
  const sessionIds = sessions?.map(s => s.id) || []

  // Récupérer les sessions email accessibles
  const { data: emailSessions } = await supabase
    .from('email_sessions')
    .select('id')
    .eq('user_id', user.id)
  const emailSessionIds = emailSessions?.map(s => s.id) || []

  // Chercher d'abord dans les contacts WhatsApp, puis email
  let contact = null
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .in('session_id', sessionIds)
      .maybeSingle()
    contact = data
  }
  if (!contact && emailSessionIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('contacts')
      .select('*')
      .eq('id', id)
      .in('email_session_id', emailSessionIds)
      .maybeSingle()
    contact = data
  }

  if (!contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
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
  const { first_name, last_name, email, notes, preferred_language, language_source } = body as {
    first_name?: string
    last_name?: string
    email?: string
    notes?: string
    preferred_language?: string | null
    language_source?: string | null
  }

  // Vérifier que le contact existe et appartient à l'utilisateur (réponse uniforme)
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
  const sessionIds = sessions?.map(s => s.id) || []

  let patchContact = null
  if (sessionIds.length > 0) {
    const { data } = await supabase.from('contacts').select('id, session_id').eq('id', id).in('session_id', sessionIds).maybeSingle()
    patchContact = data
  }
  if (!patchContact) {
    const { data: emailSess } = await supabase.from('email_sessions').select('id').eq('user_id', user.id)
    const emailSessIds = emailSess?.map(s => s.id) || []
    if (emailSessIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('contacts').select('id, session_id').eq('id', id).in('email_session_id', emailSessIds).maybeSingle()
      patchContact = data
    }
  }

  if (!patchContact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (first_name !== undefined) updateData.first_name = first_name?.trim() || null
  if (last_name !== undefined) updateData.last_name = last_name?.trim() || null
  if (email !== undefined) updateData.email = email?.trim() || null
  if (notes !== undefined) updateData.notes = notes?.trim() || null
  if (preferred_language !== undefined) updateData.preferred_language = preferred_language || null
  if (language_source !== undefined) updateData.language_source = language_source || null

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

  // Vérifier que le contact existe et appartient à l'utilisateur (réponse uniforme)
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
  const sessionIds = sessions?.map(s => s.id) || []

  let deleteContact = null
  if (sessionIds.length > 0) {
    const { data } = await supabase.from('contacts').select('id, session_id, phone_number').eq('id', id).in('session_id', sessionIds).maybeSingle()
    deleteContact = data
  }
  if (!deleteContact) {
    const { data: emailSess } = await supabase.from('email_sessions').select('id').eq('user_id', user.id)
    const emailSessIds = emailSess?.map(s => s.id) || []
    if (emailSessIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('contacts').select('id, session_id, phone_number').eq('id', id).in('email_session_id', emailSessIds).maybeSingle()
      deleteContact = data
    }
  }

  if (!deleteContact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
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
