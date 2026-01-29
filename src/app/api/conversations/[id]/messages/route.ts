import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'
import { canAccessResource } from '@/lib/teams/access'

/** GET /api/conversations/[id]/messages — Lister les messages d'une conversation */
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
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer la session pour vérifier l'accès
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, team_id')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  // Vérifier l'accès (propriétaire ou membre de l'équipe)
  const hasAccess = await canAccessResource(supabase, user.id, session.user_id, session.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer les messages
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Déchiffrer les messages
  const decryptedMessages = (messages || []).map(msg => ({
    ...msg,
    content: msg.content ? decryptMessage(msg.content) : msg.content,
  }))

  // Marquer comme lu (reset unread)
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', id)

  return NextResponse.json({ data: decryptedMessages })
}
