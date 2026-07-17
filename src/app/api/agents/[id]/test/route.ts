import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from '@/lib/openai/client'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { logAiUsage } from '@/lib/openai/usage-log'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'
import { canUseAi } from '@/lib/plans/gate'
import { buildCatalogPrompt, markdownToWhatsApp, BUTTONS_AND_CAROUSEL_SKILL } from '@/lib/openai/agent-skills'

type TestMedia = {
  ref: string
  url: string
  kind: 'image' | 'video' | 'document'
  filename: string
  mimeType: string | null
}

/**
 * Résout les balises média d'une réponse d'agent en URL signées.
 *
 * ⚠️ Les TROIS types doivent être traités : `[IMAGE:ref]` n'est qu'un cas parmi
 * `[VIDEO:ref]` et `[DOC:ref]`. Ne matcher qu'IMAGE laissait les deux autres
 * balises DANS le texte et le testeur rendait tout en <img> — d'où les vidéos
 * et PDF affichés en images cassées.
 *
 * Même expression que la production (process-ai-response.ts:652).
 */
async function resolveMediaTags(text: string, userId: string): Promise<{ cleanText: string; media: TestMedia[]; buttons: string[] }> {
  const tagRegex = /\[(IMAGE|VIDEO|DOC):([a-z0-9_-]+)\]/gi
  const refs = [...text.matchAll(tagRegex)].map(m => m[2])

  // ⚠️ LES BALISES NON RÉSOLUES ICI S'AFFICHAIENT EN CLAIR.
  //
  // Le testeur ne connaissait que IMAGE/VIDEO/DOC. Maintenant que l'agent peut
  // répondre [CAROUSEL:…], [BTN:…] et [LINK:…] (comme en production), il faut les
  // traiter — sinon le marchand lit « [CAROUSEL:the-minimal-snowboard] » dans sa
  // fenêtre de test et croit que l'agent délire.
  const btnMatch = text.match(/\[BTN:([^\]]+)\]/i)
  const buttons = btnMatch ? btnMatch[1].split('|').map(t => t.trim()).filter(Boolean).slice(0, 3) : []
  const carouselMatch = text.match(/\[CAROUSEL:([^\]]+)\]/i)
  const handles = carouselMatch
    ? carouselMatch[1].split(',').map(h => h.trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : []

  const cleanText = markdownToWhatsApp(
    text
      .replace(tagRegex, '')
      .replace(/\[BTN:[^\]]+\]/gi, '')
      .replace(/\[CAROUSEL:[^\]]+\]/gi, '')
      .replace(/\[LINK:([^|\]]+)\|([^\]]+)\]/gi, (_m, label, url) => `${label.trim()} : ${url.trim()}`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )

  const media: TestMedia[] = []

  // Carrousel : mêmes règles qu'en production — on n'envoie que les produits qui
  // ont une photo, dans l'ordre demandé par l'agent.
  if (handles.length > 0) {
    const adminC = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prods } = await (adminC as any)
      .from('shopify_products')
      .select('handle, title, price, url, image_url')
      .eq('user_id', userId)
      .in('handle', handles) as { data: { handle: string; title: string; price: string | null; url: string | null; image_url: string | null }[] | null }
    const byHandle = new Map((prods || []).map(p => [p.handle, p]))
    for (const h of handles) {
      const p = byHandle.get(h)
      if (!p?.image_url) continue
      media.push({
        ref: `product:${p.handle}`,
        kind: 'image',
        url: p.image_url,
        // Le testeur affiche `filename` sous la vignette : on y met ce que le
        // client verra vraiment en légende (nom + prix).
        filename: `${p.title}${p.price ? ` — ${p.price}` : ''}`,
        mimeType: null,
      })
    }
  }

  if (refs.length === 0) return { cleanText, media, buttons }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: records } = await (admin as any)
    .from('knowledge_images')
    .select('ref, storage_path, media_kind, filename, mime_type')
    .eq('user_id', userId)
    .in('ref', refs) as {
      data: { ref: string; storage_path: string; media_kind: string | null; filename: string; mime_type: string | null }[] | null
    }

  // ⚠️ On COMPLÈTE `media` (déjà rempli par le carrousel), on ne le redéclare
  // pas : une seconde déclaration écrasait les images produits en silence.
  for (const record of records || []) {
    const { data: signed } = await admin.storage
      .from('knowledge-images')
      .createSignedUrl(record.storage_path, 3600)
    if (!signed?.signedUrl) continue
    // Le type stocké fait foi (media_kind) ; à défaut, on déduit du MIME.
    const kind: TestMedia['kind'] =
      record.media_kind === 'video' || record.mime_type?.startsWith('video/') ? 'video'
      : record.media_kind === 'document' || record.mime_type === 'application/pdf' ? 'document'
      : 'image'
    media.push({
      ref: record.ref,
      url: signed.signedUrl,
      kind,
      filename: record.filename,
      mimeType: record.mime_type,
    })
  }

  return { cleanText, media, buttons }
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

  // Vérifier la limite de tokens.
  // EXCEPTION onboarding : l'agent se teste AVANT le choix du plan (le compte
  // a encore subscription_status='none', que checkTokenLimit refuse). On
  // accorde donc un petit budget d'essai, plafonné EN DUR côté serveur — le
  // chat d'onboarding limite déjà à 3 questions côté client.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    const ONBOARDING_TRIAL_TOKENS = 25_000
    // `as any` : onboarding_completed_at absent des types Supabase générés
    // (même contournement que /api/onboarding/state).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles')
      .select('onboarding_completed_at, tokens_used')
      .eq('id', user.id)
      .maybeSingle()
    const trialAllowed = prof && !prof.onboarding_completed_at && (prof.tokens_used || 0) < ONBOARDING_TRIAL_TOKENS
    if (!trialAllowed) {
      return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
    }
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

  // ⚠️ LE CATALOGUE PRODUITS — ABSENT ICI ALORS QU'IL EXISTE EN PRODUCTION.
  //
  // Ce fichier annonçait « même logique que processAIResponse ». Ce n'était plus
  // vrai : ni contexte boutique, ni catalogue, ni boutons, ni carrousel. Le
  // marchand testait donc un agent qui n'existe nulle part — il voyait un mur de
  // texte, corrigeait son prompt à l'aveugle, et la production faisait autre
  // chose. On lit désormais la MÊME source que la production (agent-skills).
  systemPrompt += await buildCatalogPrompt(supabase, user.id)
  systemPrompt += `\n\n--- Compétences disponibles (fenêtre SAV, réponse libre) ---${BUTTONS_AND_CAROUSEL_SKILL}\n--- Fin des compétences ---`

  // Médias envoyables (images, vidéos, documents) — mêmes règles qu'en production.
  // Le prompt ne listait que des [IMAGE:…] : l'agent ignorait donc l'existence de
  // ses vidéos et documents, et les annonçait avec une balise IMAGE.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allUserMedia } = await (supabase as any)
    .from('knowledge_images')
    .select('ref, filename, agent_id, media_kind')
    .eq('user_id', user.id) as { data: { ref: string; filename: string; agent_id: string | null; media_kind: string | null }[] | null }
  const agentMedia = (allUserMedia || []).filter(m => m.agent_id === null || m.agent_id === id)
  if (agentMedia.length > 0) {
    const byKind = (k: string) => agentMedia.filter(m => (m.media_kind || 'image') === k)
    const lines: string[] = []
    const images = byKind('image')
    const videos = byKind('video')
    const documents = byKind('document')
    if (images.length) {
      lines.push(`\n🖼️ ENVOYER UNE IMAGE, balise [IMAGE:ref]. Images disponibles :`)
      lines.push(images.map(i => `  - [IMAGE:${i.ref}] → ${i.filename}`).join('\n'))
    }
    if (videos.length) {
      lines.push(`\n🎬 ENVOYER UNE VIDÉO, balise [VIDEO:ref]. Vidéos disponibles :`)
      lines.push(videos.map(v => `  - [VIDEO:${v.ref}] → ${v.filename}`).join('\n'))
    }
    if (documents.length) {
      lines.push(`\n📄 ENVOYER UN DOCUMENT, balise [DOC:ref]. Documents disponibles :`)
      lines.push(documents.map(d => `  - [DOC:${d.ref}] → ${d.filename}`).join('\n'))
    }
    systemPrompt += `\n\n--- Médias disponibles (UTILISE-LES) ---${lines.join('\n')}\n`
      + `RÈGLE : quand le client demande un contenu correspondant, insère IMMÉDIATEMENT la balise exacte. `
      + `N'utilise jamais [IMAGE:…] pour une vidéo ou un document. Ne dis jamais que tu n'as pas le média si sa balise est listée ci-dessus.\n`
      + `--- Fin des médias ---`
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
    systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données, appelle l'outil.\n--- Fin des outils ---`
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
      const { cleanText, media, buttons } = await resolveMediaTags(result.content || '', user.id)
      return NextResponse.json({
        data: {
          response: cleanText,
          media: media.length > 0 ? media : undefined,
          buttons: buttons.length > 0 ? buttons : undefined,
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
