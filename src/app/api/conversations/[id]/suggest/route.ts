import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'
import { generateAgentResponse, type OpenAIMessage } from '@/lib/openai/client'
import { logAiUsage } from '@/lib/openai/usage-log'
import { canUseAi } from '@/lib/plans/gate'
import { checkTokenLimit } from '@/lib/openai/token-tracker'

/**
 * POST /api/conversations/[id]/suggest
 * Génère un brouillon de réponse (suggestion IA) pour une conversation,
 * à partir de l'historique et de l'agent assigné. Ne l'envoie PAS : retourne
 * juste le texte pour que l'agent humain le relise/édite avant envoi.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAi(user.id)
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Cette fonctionnalité IA nécessite un plan payant." },
      { status: 403 }
    )
  }

  // ⚠️ QUOTA DE TOKENS — protège la clé OpenAI, qui est mutualisée. Sans ce
  // contrôle, un compte pouvait boucler sur la suggestion et brûler le budget API.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Conversation + agent assigné
  const { data: conv } = await admin
    .from('conversations')
    .select('id, ai_agent_id, session_id')
    .eq('id', id)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

  // ⚠️ CONTRÔLE D'APPARTENANCE — SANS LUI, FUITE ENTRE MARCHANDS.
  //
  // Cette route utilise le client `service_role`, qui BYPASSE la RLS : c'est donc
  // au code de cloisonner. `session_id` était lu mais jamais vérifié, et le seul
  // contrôle portait sur l'AGENT (trivialement satisfait, puisqu'on retombe sur
  // le premier agent de l'appelant quand la conversation n'en a pas).
  //
  // N'importe quel marchand authentifié pouvait donc appeler cette route avec
  // l'ID d'une conversation d'un AUTRE marchand : ses 30 derniers messages
  // WhatsApp étaient déchiffrés et envoyés à OpenAI, puis résumés dans la
  // réponse. Fuite de conversations clients + PII.
  const { data: sess } = await admin
    .from('whatsapp_sessions')
    .select('user_id')
    .eq('id', conv.session_id)
    .maybeSingle()
  if (!sess || sess.user_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Agent (assigné à la conversation, sinon le premier agent de l'utilisateur)
  let agentId = conv.ai_agent_id
  if (!agentId) {
    const { data: a } = await admin.from('ai_agents').select('id').eq('user_id', user.id).limit(1).maybeSingle()
    agentId = a?.id ?? null
  }
  if (!agentId) return NextResponse.json({ error: 'Aucun agent IA configuré' }, { status: 400 })

  const { data: agent } = await admin
    .from('ai_agents')
    .select('system_prompt, model, temperature')
    .eq('id', agentId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })

  // Historique (30 derniers messages)
  const { data: messages } = await admin
    .from('messages')
    .select('direction, content, message_type')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(30)

  const history: OpenAIMessage[] = (messages ?? [])
    .reverse()
    .filter((m) => m.message_type === 'text' && m.content)
    .map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: (() => { try { return decryptMessage(m.content) } catch { return m.content } })(),
    }))

  if (history.length === 0) {
    return NextResponse.json({ error: 'Pas assez de contexte' }, { status: 400 })
  }

  const result = await generateAgentResponse({
    systemPrompt: agent.system_prompt,
    messages: history,
    model: agent.model || 'gpt-4o-mini',
    temperature: agent.temperature ?? 0.7,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  void logAiUsage({
    feature: 'sav_reply',
    model: agent.model || 'gpt-4o-mini',
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    userId: user.id,
    conversationId: id,
  })
  return NextResponse.json({ text: result.content || '' })
}
