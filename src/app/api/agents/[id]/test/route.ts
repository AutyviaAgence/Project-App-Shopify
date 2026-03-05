import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'
import { generateAgentResponse, type ChatMessage } from '@/lib/openai/client'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer l'agent
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  // Vérifier l'accès
  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { message, history } = body as {
    message: string
    history?: ChatMessage[]
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 })
  }

  // Vérifier la limite de tokens
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
  }

  // Construire les messages pour l'API
  const messages: ChatMessage[] = [
    ...(history || []),
    { role: 'user', content: message.trim() }
  ]

  // RAG : Récupérer le contexte pertinent de la base de connaissances
  let knowledgeContext = ''
  let ragTokens = 0
  const ragResult = await retrieveContext({
    agentId: id,
    query: message.trim(),
    topK: 5,
    threshold: 0.7,
  })
  if (ragResult.ok && ragResult.context) {
    knowledgeContext = ragResult.context
    ragTokens = ragResult.tokensUsed
  }

  // Construire le prompt système complet (même logique que processAIResponse)
  let systemPrompt = agent.system_prompt
  if (agent.objective) {
    systemPrompt += `\n\nObjectif principal : ${agent.objective}`
  }
  if (knowledgeContext) {
    systemPrompt += `\n\n--- Base de connaissances ---\nUtilise les informations suivantes pour répondre de manière précise. Si l'information demandée ne se trouve pas dans la base de connaissances, dis-le honnêtement.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
  }
  if (agent.auto_detect_language) {
    systemPrompt += `\n\n--- Instruction de langue ---\nIMPORTANT : Détecte automatiquement la langue utilisée par l'utilisateur dans son dernier message et réponds TOUJOURS dans cette même langue. Si l'utilisateur écrit en anglais, réponds en anglais. Si l'utilisateur écrit en espagnol, réponds en espagnol. Adapte-toi à la langue de chaque message.`
  }

  // Charger les outils de l'agent
  const agentTools = await getAgentTools(id)
  const { openaiTools, functionMap } = buildOpenAITools(agentTools)

  // Boucle de tool calling (max 5 rounds)
  let totalTokens = ragTokens
  const MAX_TOOL_ROUNDS = 5
  const conversationMessages = [...messages]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await generateAgentResponse({
      model: agent.model || 'gpt-4o-mini',
      temperature: agent.temperature || 0.7,
      systemPrompt,
      messages: conversationMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    totalTokens += result.tokensUsed

    // Réponse texte finale (pas de tool calls)
    if (!result.toolCalls) {
      await recordTokenUsage(user.id, totalTokens)
      return NextResponse.json({ data: { response: result.content } })
    }

    // Exécuter les tool calls
    conversationMessages.push({
      role: 'assistant',
      content: JSON.stringify(result.rawMessage),
    })

    for (const tc of result.toolCalls) {
      const mapping = functionMap.get(tc.functionName)
      if (!mapping) {
        conversationMessages.push({
          role: 'user',
          content: `[Tool result for ${tc.functionName}]: Function not found.`,
        })
        continue
      }

      const execResult = await executeToolCall(mapping.tool, mapping.fn, tc.arguments, {
        userId: user.id,
        agentId: id,
      })

      conversationMessages.push({
        role: 'user',
        content: `[Tool result for ${tc.functionName}]: ${execResult.result}`,
      })
    }
  }

  // Fallback si max rounds atteint
  await recordTokenUsage(user.id, totalTokens)
  return NextResponse.json({ data: { response: 'Désolé, la requête a nécessité trop d\'appels. Veuillez reformuler.' } })
}
