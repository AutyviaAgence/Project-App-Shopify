import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from '@/lib/openai/client'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { logAiUsage } from '@/lib/openai/usage-log'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'
import { canUseAi } from '@/lib/plans/gate'

async function resolveImageTags(text: string, userId: string): Promise<{ cleanText: string; images: { ref: string; url: string }[] }> {
  const refs = [...text.matchAll(/\[IMAGE:([a-z0-9_-]+)\]/gi)].map(m => m[1])
  const cleanText = text.replace(/\[IMAGE:[a-z0-9_-]+\]/gi, '').replace(/\n{3,}/g, '\n\n').trim()
  console.log('[resolveImageTags] raw text:', text)
  console.log('[resolveImageTags] extracted refs:', refs)
  if (refs.length === 0) return { cleanText, images: [] }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: imgRecords, error: dbErr } = await (admin as any)
    .from('knowledge_images')
    .select('ref, storage_path')
    .eq('user_id', userId)
    .in('ref', refs) as { data: { ref: string; storage_path: string }[] | null; error: unknown }
  console.log('[resolveImageTags] userId:', userId, 'refs:', refs, 'imgRecords:', imgRecords, 'dbErr:', dbErr)

  // Debug: list all images for this user if nothing found
  if (!imgRecords || imgRecords.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allImgs } = await (admin as any).from('knowledge_images').select('ref, user_id').limit(20)
    console.log('[resolveImageTags] all images in DB:', allImgs)
  }

  const images: { ref: string; url: string }[] = []
  for (const record of imgRecords || []) {
    const { data: signed, error: signErr } = await admin.storage
      .from('knowledge-images')
      .createSignedUrl(record.storage_path, 3600)
    console.log('[resolveImageTags] signed URL for', record.ref, ':', signed?.signedUrl, 'signErr:', signErr)
    if (signed?.signedUrl) {
      images.push({ ref: record.ref, url: signed.signedUrl })
    }
  }

  return { cleanText, images }
}

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

  // Gate IA — EXCEPTION onboarding : tester l'agent doit marcher AVANT le
  // choix du plan (le test fait partie de la config initiale offerte).
  const gate = await canUseAi(user.id)
  if (!gate.allowed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle()
    if (prof?.onboarding_completed_at) {
      return NextResponse.json(
        { error: "Cette fonctionnalité IA nécessite un plan payant." },
        { status: 403 }
      )
    }
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

  // Vérifier l'accès (propriétaire uniquement)
  if (agent.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { message, history, system_prompt_override } = body as {
    message: string
    history?: ChatMessage[]
    /** Prompt en cours d'édition (onboarding) — testé sans sauvegarder l'agent. */
    system_prompt_override?: string
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

  // Onboarding : on teste le prompt en cours d'édition (override), sinon celui
  // sauvegardé sur l'agent.
  let systemPrompt = (typeof system_prompt_override === 'string' && system_prompt_override.trim())
    ? system_prompt_override.trim()
    : agent.system_prompt

  // Détection automatique de langue — injectée EN PREMIER pour priorité maximale
  if (agent.auto_detect_language) {
    systemPrompt = `--- RÈGLE ABSOLUE DE LANGUE ---\nDétecte TOUJOURS la langue du dernier message de l'utilisateur et réponds OBLIGATOIREMENT dans cette même langue. Si l'utilisateur écrit en anglais → réponds en anglais. En espagnol → espagnol. En arabe → arabe. Cette règle prime sur tout le reste du prompt.\n--- FIN RÈGLE DE LANGUE ---\n\n` + systemPrompt
  }

  systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).\nUtilise TOUJOURS cette date comme référence. "Demain" = le jour suivant cette date. Pour les dates et heures dans les outils, utilise le format ISO 8601 avec timezone, par exemple : 2026-03-06T15:00:00+01:00.`
  if (agent.objective) {
    systemPrompt += `\n\nObjectif principal : ${agent.objective}`
  }
  if (knowledgeContext) {
    systemPrompt += `\n\n--- Base de connaissances (PRIORITAIRE) ---\nIMPORTANT : Avant d'appeler un outil, vérifie TOUJOURS si la réponse se trouve dans la base de connaissances ci-dessous. N'appelle un outil que si l'information n'est PAS disponible ici. Utilise ces informations en priorité pour répondre de manière précise.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
  }

  // Injecter les images disponibles (toutes celles de l'utilisateur, filtrées par agent en JS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allUserImages } = await (supabase as any)
    .from('knowledge_images')
    .select('ref, filename, agent_id')
    .eq('user_id', user.id) as { data: { ref: string; filename: string; agent_id: string | null }[] | null }
  const agentImages = (allUserImages || []).filter(img => img.agent_id === null || img.agent_id === id)
  if (agentImages.length > 0) {
    const imgList = agentImages.map(i => `- [IMAGE:${i.ref}] → ${i.filename}`).join('\n')
    systemPrompt += `\n\n--- Images disponibles (UTILISE-LES) ---\nQuand l'utilisateur demande une image ou que le contexte s'y prête, tu DOIS insérer la balise [IMAGE:ref] dans ta réponse. Le système enverra l'image automatiquement.\nImages disponibles :\n${imgList}\nRÈGLE : si l'utilisateur demande "l'image", "une image", ou un contenu visuel, insère IMMÉDIATEMENT la balise correspondante. Ne dis jamais que tu n'as pas d'image si une balise est listée ci-dessus.\nExemple : pour envoyer "menu-burger", écris [IMAGE:menu-burger] dans ta réponse.\n--- Fin des images ---`
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
      agentTools = toolsFromAuth as typeof agentTools
    }
  }

  const { openaiTools, functionMap } = buildOpenAITools(agentTools)

  // Ajouter instruction outils au system prompt
  if (openaiTools.length > 0) {
    const toolNames = openaiTools.map(t => t.function.name).join(', ')
    systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données — appelle l'outil.\n--- Fin des outils ---`
  }

  // Boucle de tool calling (max 5 rounds)
  let totalTokens = ragTokens
  const MAX_TOOL_ROUNDS = 10
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

    void logAiUsage({
      feature: 'agent_generate',
      model: agent.model || 'gpt-4o-mini',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      userId: user.id,
    })

    totalTokens += result.tokensUsed

    // Réponse texte finale (pas de tool calls)
    if (!result.toolCalls) {
      await recordTokenUsage(user.id, totalTokens)
      const { cleanText, images } = await resolveImageTags(result.content || '', user.id)
      return NextResponse.json({
        data: {
          response: cleanText,
          images: images.length > 0 ? images : undefined,
          toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
          rag: ragInfo,
        }
      })
    }

    // Add the assistant message with tool_calls (native format)
    conversationMessages.push(result.rawMessage as OpenAIMessage)

    // Execute each tool call and add result with role: "tool"
    for (const tc of result.toolCalls) {
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
  return NextResponse.json({ data: { response: "Désolé, la requête a nécessité trop d'appels. Veuillez reformuler.", toolExecutions, rag: ragInfo } })
}
