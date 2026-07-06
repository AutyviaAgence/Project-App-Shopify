import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { generateTemplates } from '@/lib/templates/generate'
import { TEMPLATE_VARIABLES } from '@/lib/templates/variables'
import { USE_CASES } from '@/lib/templates/use-cases'
import { buildStoreContextPrompt } from '@/lib/shopify/sync'

/**
 * POST /api/templates/converse
 *
 * Assistant CONVERSATIONNEL de création de template. L'IA pose une question à la
 * fois selon les réponses ; quand elle a assez d'infos, elle DÉDUIT elle-même
 * l'objectif, la catégorie, le ton ET les variables (100% auto) puis génère les
 * 3 propositions (réutilise generateTemplates).
 *
 * Entrée : { messages: {role:'user'|'assistant', content:string}[] }
 * Sortie :
 *   - { mode:'ask', question, options?: string[] }  → question suivante
 *   - { mode:'ready', proposals, meta:{objective,use_case,tone,variable_keys} }
 */
type Msg = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[] }
  const messages = (body.messages || []).filter((m) => m && m.content?.trim()).slice(-20)

  const varCatalog = TEMPLATE_VARIABLES.map((v) => `- ${v.key} : ${v.label}`).join('\n')
  const useCaseList = USE_CASES.map((u) => `- ${u.key} : ${u.label}`).join('\n')

  // Prompt de contrôle : l'IA décide si elle pose une question OU si elle est prête.
  const system = `Tu es un assistant qui aide un marchand e-commerce à créer un message WhatsApp (template).
Tu poses des questions COURTES, UNE À LA FOIS, pour comprendre :
 - le but du message (ex : relancer un panier, confirmer une commande, offrir un code promo, demander un avis…),
 - la situation d'envoi,
 - une éventuelle incitation (code promo, livraison offerte…),
 - le ton souhaité.
Dès que tu as assez d'infos (2 à 4 questions max), tu passes en mode "ready".

Tu ne demandes JAMAIS au marchand quelles variables inclure : tu les déduis toi-même.
Catégories possibles :
${useCaseList}
Variables disponibles (déduis les bonnes selon le but) :
${varCatalog}

Réponds UNIQUEMENT en JSON :
- Pour poser une question : { "mode":"ask", "question":"...", "options":["...","..."] }  (options = réponses rapides suggérées, facultatif, 2-4 max)
- Quand tu as assez d'infos : { "mode":"ready", "objective":"résumé clair et détaillé du message à générer", "use_case":"<clé catégorie>", "tone":"professional|friendly|casual", "variable_keys":["<clé>", ...] }
La première fois (aucune réponse encore), pose une question d'ouverture simple.`

  const chatMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 3, timeout: 60_000 })
  const started = Date.now()
  let decision: {
    mode: 'ask' | 'ready'
    question?: string
    options?: string[]
    objective?: string
    use_case?: string
    tone?: string
    variable_keys?: string[]
  }
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o-mini',
      messages: chatMessages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'template_generate', model: res.model || 'gpt-4o-mini',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    decision = JSON.parse(res.choices[0]?.message?.content || '{}')
  } catch {
    return NextResponse.json({ error: 'Échec de l’assistant. Réessayez.' }, { status: 502 })
  }

  // Mode question → on renvoie la question à afficher.
  if (decision.mode !== 'ready') {
    return NextResponse.json({
      mode: 'ask',
      question: decision.question || 'Décrivez le message que vous souhaitez créer.',
      options: Array.isArray(decision.options) ? decision.options.slice(0, 4) : undefined,
    })
  }

  // Mode prêt → génération des 3 propositions (variables déduites par l'IA).
  const validKeys = TEMPLATE_VARIABLES.map((v) => v.key)
  const variableKeys = (decision.variable_keys || []).filter((k) => validKeys.includes(k))
  const useCase = USE_CASES.some((u) => u.key === decision.use_case) ? decision.use_case! : 'marketing'
  const tone = ['professional', 'friendly', 'casual'].includes(decision.tone || '') ? decision.tone! : 'professional'
  const objective = (decision.objective || '').trim() || messages.map((m) => m.content).join(' ')

  // Contexte boutique + produits (comme /generate).
  const { data: store } = await supabase
    .from('shopify_stores').select('store_context').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeContextPrompt = store?.store_context ? buildStoreContextPrompt(store.store_context as any) : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = await (supabase as any)
    .from('shopify_products').select('title, price, url, image_url').eq('user_id', user.id).limit(12)

  const proposals = await generateTemplates({
    useCase: useCase as never,
    objective,
    tone: tone as never,
    variableKeys,
    storeContextPrompt,
    products: products || [],
  })

  return NextResponse.json({
    mode: 'ready',
    proposals,
    meta: { objective, use_case: useCase, tone, variable_keys: variableKeys },
  })
}
