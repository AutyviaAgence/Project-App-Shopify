import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decryptMessage } from '@/lib/crypto/encryption'
import { retrieveContext } from '@/lib/knowledge/retriever'
import OpenAI from 'openai'

/** POST /api/email/suggest — Générer un brouillon de réponse email via l'agent IA de la session */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { conversation_id } = body as { conversation_id?: string }

  if (!conversation_id) {
    return NextResponse.json({ error: 'conversation_id requis' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer la conversation (avec l'agent assigné à la conversation si présent)
  const { data: conversation } = await adminSupabase
    .from('conversations')
    .select('id, channel, email_session_id, ai_agent_id')
    .eq('id', conversation_id)
    .single() as { data: { id: string; channel: string; email_session_id: string | null; ai_agent_id: string | null } | null }

  if (!conversation || conversation.channel !== 'email' || !conversation.email_session_id) {
    return NextResponse.json({ error: 'Conversation email introuvable' }, { status: 404 })
  }

  // Vérifier ownership + récupérer l'agent de la session (fallback)
  const { data: emailSession } = await adminSupabase
    .from('email_sessions')
    .select('id, email_agent_id, email_address, display_name')
    .eq('id', conversation.email_session_id)
    .eq('user_id', user.id)
    .single() as { data: { id: string; email_agent_id: string | null; email_address: string; display_name: string | null } | null }

  if (!emailSession) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Priorité : agent de la conversation > agent de la session
  const agentId = conversation.ai_agent_id ?? emailSession.email_agent_id

  if (!agentId) {
    return NextResponse.json({ error: 'Aucun agent IA configuré (ni sur la conversation ni sur la session email)' }, { status: 400 })
  }

  // Récupérer l'agent IA (avec objective)
  const { data: agent } = await adminSupabase
    .from('ai_agents')
    .select('id, name, system_prompt, objective')
    .eq('id', agentId)
    .single() as { data: { id: string; name: string; system_prompt: string; objective: string | null } | null }

  if (!agent || !agent.system_prompt) {
    return NextResponse.json({ error: 'Agent IA introuvable ou sans prompt' }, { status: 404 })
  }

  // Récupérer les 30 derniers messages de la conversation (aligné avec le contexte WhatsApp)
  const { data: messages } = await adminSupabase
    .from('messages')
    .select('content, direction, sent_by, transcription')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(30) as { data: Array<{ content: string; direction: string; sent_by: string; transcription: string | null }> | null }

  const history = (messages ?? []).reverse().map((m) => {
    const text = (() => { try { return decryptMessage(m.content) } catch { return m.content } })()
    const subject = m.transcription?.startsWith('Objet: ') ? ` [Objet: ${m.transcription.slice(7)}]` : ''
    return {
      role: m.direction === 'inbound' ? 'user' : 'assistant' as 'user' | 'assistant',
      content: `${text}${subject}`,
    }
  })

  // RAG : récupérer le contexte pertinent de la base de connaissances
  let knowledgeContext = ''
  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user')
  if (lastUserMessage) {
    const ragResult = await retrieveContext({
      agentId,
      query: lastUserMessage.content,
      topK: 5,
      threshold: 0.35,
    })
    if (ragResult.ok && ragResult.context) {
      knowledgeContext = ragResult.context
    }
  }

  const senderName = emailSession.display_name || emailSession.email_address

  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Paris' })
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

  let systemPrompt = agent.system_prompt

  if (agent.objective) {
    systemPrompt += `\n\nObjectif principal : ${agent.objective}`
  }

  if (knowledgeContext) {
    systemPrompt += `\n\n--- Base de connaissances (PRIORITAIRE) ---\nUtilise ces informations en priorité pour répondre de manière précise.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
  }

  systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).`

  systemPrompt += `\n\nTu rédiges un brouillon de réponse email au nom de "${senderName}".
Génère uniquement le corps de la réponse, sans salutation générique ni signature — l'utilisateur les ajoutera lui-même.
Sois concis, professionnel et adapte-toi au ton du dernier message reçu.`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })

    const suggested = completion.choices[0]?.message?.content ?? ''
    const tokensUsed = completion.usage?.total_tokens ?? 0

    if (tokensUsed > 0) {
      await supabase.rpc('increment_token_usage', { p_user_id: user.id, p_tokens: tokensUsed })
    }

    return NextResponse.json({ text: suggested, tokens_used: tokensUsed })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erreur IA : ${errMsg}` }, { status: 500 })
  }
}
