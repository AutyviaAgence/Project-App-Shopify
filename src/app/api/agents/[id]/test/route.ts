import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from '@/lib/openai/client'
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
  let ragInfo: { chunksUsed: number; documentNames: string[]; error?: string } | null = null
  const ragResult = await retrieveContext({
    agentId: id,
    query: message.trim(),
    topK: 5,
    threshold: 0.35,
  })
  if (ragResult.ok && ragResult.context) {
    knowledgeContext = ragResult.context
    ragTokens = ragResult.tokensUsed

    // Récupérer les noms des documents sources
    const docIds = [...new Set(ragResult.chunks.map(c => c.document_id))]
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from('knowledge_documents')
        .select('id, name')
        .in('id', docIds)
      ragInfo = {
        chunksUsed: ragResult.chunks.length,
        documentNames: docs?.map(d => d.name) || [],
      }
    }
  } else if (ragResult.ok && ragResult.chunks.length === 0) {
    // RAG actif mais aucun résultat pertinent trouvé
    ragInfo = { chunksUsed: 0, documentNames: [] }
  } else if (!ragResult.ok) {
    ragInfo = { chunksUsed: 0, documentNames: [], error: ragResult.error }
  }

  // Construire le prompt système complet (même logique que processAIResponse)
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Paris' })
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

  let systemPrompt = agent.system_prompt
  systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).\nUtilise TOUJOURS cette date comme référence. "Demain" = le jour suivant cette date. Pour les dates et heures dans les outils, utilise le format ISO 8601 avec timezone, par exemple : 2026-03-06T15:00:00+01:00.`
  if (agent.objective) {
    systemPrompt += `\n\nObjectif principal : ${agent.objective}`
  }
  if (knowledgeContext) {
    systemPrompt += `\n\n--- Base de connaissances (PRIORITAIRE) ---\nIMPORTANT : Avant d'appeler un outil, vérifie TOUJOURS si la réponse se trouve dans la base de connaissances ci-dessous. N'appelle un outil que si l'information n'est PAS disponible ici. Utilise ces informations en priorité pour répondre de manière précise.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
  }
  if (agent.auto_detect_language) {
    systemPrompt += `\n\n--- Instruction de langue ---\nIMPORTANT : Détecte automatiquement la langue utilisée par l'utilisateur dans son dernier message et réponds TOUJOURS dans cette même langue. Si l'utilisateur écrit en anglais, réponds en anglais. Si l'utilisateur écrit en espagnol, réponds en espagnol. Adapte-toi à la langue de chaque message.`
  }

  // Charger les outils de l'agent
  let agentTools = await getAgentTools(id)

  // Fallback: query via authenticated supabase client if admin client returns empty
  if (agentTools.length === 0) {
    const { data: toolsFromAuth } = await supabase
      .from('agent_tools')
      .select('*')
      .eq('agent_id', id)
      .eq('is_active', true)
    if (toolsFromAuth && toolsFromAuth.length > 0) {
      agentTools = toolsFromAuth as any
    }
  }

  const { openaiTools, functionMap } = buildOpenAITools(agentTools)

  // Qualifier : ajouter route_to_agent + injection system prompt
  let qualifierRoutes: { id: string; target_agent_id: string; name: string; description: string }[] = []
  if (agent.agent_type === 'qualifier') {
    const { data: routes } = await supabase
      .from('qualifier_routes')
      .select('id, target_agent_id, name, description')
      .eq('agent_id', id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    qualifierRoutes = routes || []
    if (qualifierRoutes.length > 0) {
      const routesList = qualifierRoutes.map((r, i) => `${i + 1}. "${r.name}" — ${r.description}`).join('\n')
      systemPrompt += `\n\n--- Agent Qualificateur ---\nScénarios de redirection disponibles :\n${routesList}\n\nPour rediriger, appelle la fonction "route_to_agent" avec le nom exact du scénario.\nDès que le contact montre un intérêt (même vague) pour un service, appelle route_to_agent IMMÉDIATEMENT sans envoyer de message texte.\nN'écris JAMAIS le nom de la fonction dans ton texte — appelle-la via function call.\n--- Fin qualificateur ---`

      const routeNames = qualifierRoutes.map(r => r.name)
      openaiTools.push({
        type: 'function' as const,
        function: {
          name: 'route_to_agent',
          description: 'Redirige la conversation vers un agent spécialisé. Appelle cette fonction dès que le contact montre un intérêt pour un service. Ne génère AUCUN texte quand tu appelles cette fonction.',
          parameters: {
            type: 'object',
            properties: {
              scenario_name: {
                type: 'string',
                description: `Le nom exact du scénario de redirection. Valeurs possibles : ${routeNames.map(n => `"${n}"`).join(', ')}`,
                enum: routeNames,
              },
            },
            required: ['scenario_name'],
          },
        },
      })
    }
  }

  // Ajouter instruction outils au system prompt
  if (openaiTools.length > 0) {
    const toolNames = openaiTools.map(t => t.function.name).join(', ')
    systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données — appelle l'outil.\n--- Fin des outils ---`
  }

  // Boucle de tool calling (max 5 rounds)
  let totalTokens = ragTokens
  const MAX_TOOL_ROUNDS = 5
  const conversationMessages: OpenAIMessage[] = [
    ...messages.map(m => ({ role: m.role, content: m.content }) as OpenAIMessage),
  ]
  const toolExecutions: Array<{ name: string; args: Record<string, unknown>; result: string; success: boolean; durationMs: number }> = []

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
      return NextResponse.json({
        data: {
          response: result.content,
          toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
          rag: ragInfo,
        }
      })
    }

    // Qualifier : détecter route_to_agent avant de continuer la boucle
    if (agent.agent_type === 'qualifier') {
      const routeCall = result.toolCalls.find(tc => tc.functionName === 'route_to_agent')
      if (routeCall) {
        const args = routeCall.arguments as { scenario_name?: string }
        const matchedRoute = qualifierRoutes.find(r => r.name === args.scenario_name)
        if (matchedRoute) {
          // Récupérer le nom de l'agent cible
          const { data: targetAgent } = await supabase
            .from('ai_agents')
            .select('name')
            .eq('id', matchedRoute.target_agent_id)
            .single()

          await recordTokenUsage(user.id, totalTokens)
          return NextResponse.json({
            data: {
              response: '',
              event: 'route',
              routeTo: targetAgent?.name || matchedRoute.name,
              routeScenario: matchedRoute.name,
              rag: ragInfo,
              toolExecutions: [{
                name: 'route_to_agent',
                args: routeCall.arguments,
                result: `Redirigé vers "${targetAgent?.name || matchedRoute.name}"`,
                success: true,
                durationMs: 0,
              }],
            }
          })
        }
      }
    }

    // Add the assistant message with tool_calls (native format)
    conversationMessages.push(result.rawMessage as OpenAIMessage)

    // Execute each tool call and add result with role: "tool"
    for (const tc of result.toolCalls) {
      // Skip route_to_agent (handled above for qualifier)
      if (tc.functionName === 'route_to_agent') continue

      const mapping = functionMap.get(tc.functionName)
      if (!mapping) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: tc.toolCallId,
          content: 'Error: Unknown function',
        })
        toolExecutions.push({ name: tc.functionName, args: tc.arguments, result: 'Unknown function', success: false, durationMs: 0 })
        continue
      }

      const execResult = await executeToolCall(mapping.tool, mapping.fn, tc.arguments, {
        userId: user.id,
        agentId: id,
      })

      conversationMessages.push({
        role: 'tool',
        tool_call_id: tc.toolCallId,
        content: execResult.result,
      })

      toolExecutions.push({
        name: tc.functionName,
        args: tc.arguments,
        result: execResult.result.slice(0, 500),
        success: execResult.success,
        durationMs: execResult.durationMs,
      })
    }
  }

  // Fallback si max rounds atteint
  await recordTokenUsage(user.id, totalTokens)
  return NextResponse.json({ data: { response: 'Désolé, la requête a nécessité trop d\'appels. Veuillez reformuler.', toolExecutions, rag: ragInfo } })
}
