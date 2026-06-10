import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/conversations/[id] — Récupérer une conversation par son ID */
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

  // Récupérer la conversation
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer la session pour vérifier l'accès
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', conversation.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer le contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conversation.contact_id)
    .single()

  return NextResponse.json({
    data: {
      ...conversation,
      contact: contact || null,
      session: {
        id: session.id,
        instance_name: session.instance_name,
        phone_number: session.phone_number,
      },
    },
  })
}

/** PATCH /api/conversations/[id] — Toggle pin */
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
  const { is_pinned } = body

  if (typeof is_pinned !== 'boolean') {
    return NextResponse.json({ error: 'is_pinned requis (boolean)' }, { status: 400 })
  }

  // Vérifier que la conversation existe et que l'utilisateur y a accès
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, session_id, email_session_id, channel')
    .eq('id', id)
    .single() as { data: { id: string; session_id: string | null; email_session_id: string | null; channel: string | null } | null }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  if (conversation.channel === 'email' || !conversation.session_id) {
    // Vérification accès email via email_sessions
    if (conversation.email_session_id) {
      const { data: emailSession } = await supabase
        .from('email_sessions')
        .select('user_id')
        .eq('id', conversation.email_session_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!emailSession) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    } else {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
  } else {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('id', conversation.session_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update({ is_pinned })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
