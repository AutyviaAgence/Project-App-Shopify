import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'
import { canAccessSession, checkTeamPermission } from '@/lib/teams/access'

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

  // Vérifier l'accès (propriétaire ou membre avec permissions)
  const hasAccess = await canAccessSession(supabase, user.id, session)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Vérifier la permission can_view_messages pour les ressources d'équipe
  if (session.team_id && session.user_id !== user.id) {
    const canViewMessages = await checkTeamPermission(supabase, user.id, session.team_id, 'messages_view')
    if (!canViewMessages) {
      return NextResponse.json({ error: 'Permission de lecture des messages refusée' }, { status: 403 })
    }
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

  // Récupérer les noms des agents IA pour les messages envoyés par des agents
  const agentIds = [...new Set((messages || []).filter(m => m.ai_agent_id).map(m => m.ai_agent_id).filter((id): id is string => id !== null))]
  let agentsMap: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('id, name')
      .in('id', agentIds)
    agentsMap = Object.fromEntries((agents || []).map(a => [a.id, a.name]))
  }

  // Déchiffrer les messages et ajouter le nom de l'agent
  const decryptedMessages = (messages || []).map(msg => ({
    ...msg,
    content: msg.content ? decryptMessage(msg.content) : msg.content,
    transcription: msg.transcription ? decryptMessage(msg.transcription) : null,
    agent_name: msg.ai_agent_id ? agentsMap[msg.ai_agent_id] || null : null,
  }))

  // Marquer comme lu (reset unread)
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', id)

  return NextResponse.json({ data: decryptedMessages })
}
