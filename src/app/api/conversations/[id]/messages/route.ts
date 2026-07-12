import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'

/** GET /api/conversations/[id]/messages — Lister les messages d'une conversation */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Pagination (par défaut: 100 derniers messages, max 200)
  const searchParams = req.nextUrl.searchParams
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '100') || 100, 200))
  const before = searchParams.get('before') // cursor: created_at ISO pour charger les messages précédents
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

  // Vérifier l'ownership de la session WhatsApp (système d'équipes retiré)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id')
    .eq('id', conversation.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }
  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Récupérer les messages (paginés, les plus récents en dernier)
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)

  if (before) {
    query = query.lt('created_at', before)
  }

  // On récupère limit+1 pour savoir s'il y a des messages plus anciens
  const { data: messages, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Vérifier s'il y a des messages plus anciens
  const hasMore = (messages || []).length > limit
  const paginatedMessages = (messages || []).slice(0, limit).reverse() // Remettre en ordre chronologique

  // Récupérer les noms des agents IA pour les messages envoyés par des agents
  const agentIds = [...new Set(paginatedMessages.filter(m => m.ai_agent_id).map(m => m.ai_agent_id).filter((id): id is string => id !== null))]
  let agentsMap: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('id, name')
      .in('id', agentIds)
    agentsMap = Object.fromEntries((agents || []).map(a => [a.id, a.name]))
  }

  // Charger les tool execution logs pour cette conversation
  const { data: toolLogs, error: toolLogsError } = await supabase
    .from('tool_execution_logs')
    .select('id, function_name, parameters, result, status, error_message, duration_ms, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  console.log(`[Messages] Conv ${id}: ${toolLogs?.length ?? 0} tool logs found${toolLogsError ? ` (error: ${toolLogsError.message})` : ''}`)

  // Grouper les tool executions par message AI (le message AI est créé juste après les tool calls)
  // On associe chaque tool execution au message AI dont le created_at est juste après (dans les 60s)
  const aiMessages = paginatedMessages.filter(m => m.sent_by === 'ai_agent')
  const toolExecsByMessage: Record<string, typeof toolLogs> = {}

  if (toolLogs && toolLogs.length > 0 && aiMessages.length > 0) {
    for (const log of toolLogs) {
      const logTime = new Date(log.created_at).getTime()
      // Find the closest AI message that was created AFTER this tool execution (within 60s)
      let bestMsg: (typeof aiMessages)[0] | null = null
      let bestDiff = Infinity
      for (const msg of aiMessages) {
        const msgTime = new Date(msg.created_at).getTime()
        const diff = msgTime - logTime
        if (diff >= 0 && diff < 60000 && diff < bestDiff) {
          bestDiff = diff
          bestMsg = msg
        }
      }
      if (bestMsg) {
        if (!toolExecsByMessage[bestMsg.id]) toolExecsByMessage[bestMsg.id] = []
        toolExecsByMessage[bestMsg.id]!.push(log)
      }
    }
  }

  // Déchiffrer les messages et ajouter le nom de l'agent + tool executions
  const decryptedMessages = paginatedMessages.map(msg => ({
    ...msg,
    content: msg.content ? decryptMessage(msg.content) : msg.content,
    transcription: msg.transcription ? decryptMessage(msg.transcription) : null,
    agent_name: msg.ai_agent_id ? agentsMap[msg.ai_agent_id] || null : null,
    tool_executions: toolExecsByMessage[msg.id]?.map(log => ({
      name: log.function_name,
      result: log.status === 'success'
        ? (typeof log.result === 'object' ? JSON.stringify(log.result) : String(log.result || ''))
        : (log.error_message || log.status),
      success: log.status === 'success',
      durationMs: log.duration_ms || 0,
    })) || undefined,
  }))

  // Marquer comme lu (reset unread) — utilise le client admin car RLS bloque l'update sur conversations
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await adminSupabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', id)

  return NextResponse.json({
    data: decryptedMessages,
    hasMore,
    nextCursor: hasMore ? paginatedMessages[0]?.created_at : null,
  })
}
