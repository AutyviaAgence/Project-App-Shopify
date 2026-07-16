import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { generateTemplates } from '@/lib/templates/generate'
import { TEMPLATE_VARIABLES } from '@/lib/templates/variables'
import { USE_CASES } from '@/lib/templates/use-cases'
import { buildStoreContextPrompt } from '@/lib/shopify/sync'
import { canUseAiOrOnboarding } from '@/lib/plans/gate'

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

/**
 * L'IA demande-t-elle la VALEUR d'une variable ?
 *
 * ⚠️ GARDE-FOU, pas une redite du prompt.
 *
 * Le prompt le lui interdit explicitement, mais un prompt reste une consigne :
 * le modèle a réellement enchaîné « Quel est le prénom du client ? », « Quel est
 * le numéro de commande ? », « Quel est le montant ? » — des questions absurdes
 * puisque ces valeurs changent à chaque envoi. Le marchand ne peut répondre que
 * « je ne sais pas », et l'assistant devient inutilisable.
 *
 * On détecte la question sur les LABELS du catalogue (« prénom client », « n° de
 * commande »…), qui sont précisément ce que l'IA ne doit jamais demander.
 */
function asksForVariableValue(question: string): boolean {
  const q = question.toLowerCase()
  // Une question qui EXPLIQUE les variables est légitime ; seule une demande de
  // valeur ne l'est pas. On exige donc une formulation interrogative de valeur.
  const asksValue = /\b(quel|quelle|quels|quelles|donnez|indiquez|précisez|saisissez)\b/.test(q)
  if (!asksValue) return false

  // Sujets interdits : ce que porte une variable (donc propre à chaque client).
  const forbidden = [
    'prénom', 'prenom', 'nom du client', 'nom complet',
    'numéro de commande', 'numero de commande', 'n° de commande', 'no de commande',
    'montant', 'total de la commande', 'statut de la commande',
    'numéro de suivi', 'numero de suivi', 'n° de suivi',
    'email du client', 'téléphone du client', 'telephone du client',
    'date de commande', 'date de la commande',
  ]
  return forbidden.some((f) => q.includes(f))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAiOrOnboarding(user.id)
  if (!gate.allowed) return NextResponse.json({ error: 'L’assistant IA de création de modèles nécessite un plan payant.', upgrade: true }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[] }
  const messages = (body.messages || []).filter((m) => m && m.content?.trim()).slice(-20)

  const varCatalog = TEMPLATE_VARIABLES.map((v) => `- ${v.key} : ${v.label}`).join('\n')
  // La famille (transactionnel/campagne) vient de `metaCategory`, la source de
  // vérité — pas d'une liste figée dans le prompt qui mentirait au premier
  // réordonnancement des USE_CASES.
  const useCaseList = USE_CASES.map(
    (u) => `- ${u.key} : ${u.label} — ${u.metaCategory === 'MARKETING' ? 'CAMPAGNE' : 'TRANSACTIONNEL'} (${u.description})`
  ).join('\n')

  // Prompt de contrôle : l'IA décide si elle pose une question OU si elle est prête.
  const system = `Tu es un assistant qui aide un marchand e-commerce à créer un message WhatsApp (template).

# CE QU'EST UN TEMPLATE

Un template est un MODÈLE réutilisable, envoyé à des MILLIERS de clients différents.
Les données propres à chaque client (prénom, n° de commande, montant…) n'y sont pas
écrites en dur : ce sont des VARIABLES, remplies automatiquement à l'envoi.

# ⚠️ NE DEMANDE JAMAIS LA VALEUR D'UNE VARIABLE

C'est l'erreur la plus grave que tu puisses commettre, et la plus fréquente.

Le marchand ne connaît PAS le prénom du client, ni le n° de commande, ni le montant :
ils changent à CHAQUE envoi. Lui poser la question n'a aucun sens — il ne peut
répondre que « je ne sais pas », et il aura raison.

INTERDIT (ne pose JAMAIS ces questions) :
 ✗ « Quel est le prénom du client ? »
 ✗ « Quel est le nom complet du client ? »
 ✗ « Quel est le numéro de commande ? »
 ✗ « Quel est le montant total de la commande ? »
 ✗ « Quel est le statut de la commande ? »
 ✗ toute question portant sur une donnée figurant dans la liste des variables ci-dessous.

À la place, tu insères la variable et tu passes à la suite. Le message généré doit
ressembler à « Bonjour {{1}}, votre commande {{2}} est confirmée » — jamais à
« Bonjour Marie, votre commande #1053 est confirmée ».

Tu ne demandes pas non plus QUELLES variables inclure : tu les déduis toi-même du but.

# DEUX FAMILLES DE MESSAGES — NE LES MÉLANGE JAMAIS

Meta classe les templates en deux catégories, et REFUSE ceux qui mentent sur leur nature.
C'est la distinction la plus structurante : elle décide des questions à poser.

1. TRANSACTIONNEL (UTILITY) — informe sur une commande EXISTANTE.
   Ex : commande confirmée, colis expédié, livré, remboursement, demande d'avis.
   → Envoyé automatiquement suite à un événement. AUCUNE promotion, AUCUN code promo,
     AUCUNE incitation à acheter : Meta refuserait le modèle.
   → Questions utiles : quel événement déclenche l'envoi ? quelle info donner ?
     faut-il un bouton de suivi ? le ton ?
   → NE DEMANDE PAS de code promo ni de réduction : ça n'a pas sa place ici.

2. CAMPAGNE / MARKETING — cherche à faire acheter.
   Ex : promo, nouveauté, relance de panier abandonné, déstockage.
   → Questions utiles : quelle offre exactement ? y a-t-il un code promo, une remise,
     une date limite ? quel produit met-on en avant ? le ton ?

Si le but du marchand est ambigu, ta PREMIÈRE question tranche entre les deux
(ex : « Ce message informe sur une commande, ou fait-il la promotion d'une offre ? »).
S'il est clair dès le premier message, ne repose pas la question : déduis-le.
« Commande créée / confirmée / expédiée / livrée » = TRANSACTIONNEL, sans ambiguïté.

# CE QUE TU DOIS DEMANDER

Uniquement ce que le marchand est SEUL à savoir, et que tu ne peux pas deviner :
 - la famille (transactionnel ou campagne), si elle n'est pas évidente,
 - l'offre ou l'incitation, UNIQUEMENT en campagne (code promo, remise, date limite),
 - le ton souhaité.

Questions COURTES, UNE À LA FOIS. Dès que tu as assez d'infos (2 à 4 questions MAX),
tu passes en mode "ready". Si le but est déjà clair dès le premier message, ne pose
qu'une question (le ton), voire aucune.

Catégories possibles (chacune indique sa famille) :
${useCaseList}
Variables disponibles (déduis les bonnes selon le but ; ne demande JAMAIS leur valeur) :
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
    const question = decision.question || 'Décrivez le message que vous souhaitez créer.'

    // ⚠️ L'IA demande la valeur d'une variable malgré l'interdiction du prompt.
    // On ne laisse pas passer : on la relance UNE fois avec un rappel sec. Si
    // elle persiste, on génère avec ce qu'on a — mieux vaut une proposition
    // imparfaite qu'un interrogatoire auquel le marchand ne peut pas répondre.
    if (asksForVariableValue(question)) {
      console.warn('[templates/converse] question sur une variable, relance:', question)
      try {
        const retry = await openai.chat.completions.create({
          store: false,
          model: 'gpt-4o-mini',
          messages: [
            ...chatMessages,
            { role: 'assistant' as const, content: JSON.stringify(decision) },
            {
              role: 'user' as const,
              content:
                'STOP. Tu viens de demander la valeur d’une variable (prénom, n° de commande, montant…). ' +
                'Le marchand ne peut PAS le savoir : ces données changent à chaque client et sont remplies ' +
                'automatiquement à l’envoi. Ne repose jamais ce type de question. ' +
                'Soit tu poses une question sur le BUT, l’INCITATION ou le TON, soit tu passes en mode "ready".',
            },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        })
        const second = JSON.parse(retry.choices[0]?.message?.content || '{}')
        void logAiUsage({
          feature: 'template_generate', model: retry.model || 'gpt-4o-mini',
          promptTokens: retry.usage?.prompt_tokens || 0, completionTokens: retry.usage?.completion_tokens || 0,
          latencyMs: Date.now() - started, userId: user.id,
        })
        // La relance a redressé le tir → on suit sa décision (question saine, ou
        // génération). Sinon on force la génération.
        if (second.mode === 'ready') decision = second
        else if (second.question && !asksForVariableValue(second.question)) {
          return NextResponse.json({
            mode: 'ask',
            question: second.question,
            options: Array.isArray(second.options) ? second.options.slice(0, 4) : undefined,
          })
        } else {
          decision = { ...decision, mode: 'ready' }
        }
      } catch {
        decision = { ...decision, mode: 'ready' } // on génère plutôt que de bloquer
      }
    } else {
      return NextResponse.json({
        mode: 'ask',
        question,
        options: Array.isArray(decision.options) ? decision.options.slice(0, 4) : undefined,
      })
    }
  }

  // Mode prêt → génération des 3 propositions (variables déduites par l'IA).
  const validKeys = TEMPLATE_VARIABLES.map((v) => v.key)
  let variableKeys = (decision.variable_keys || []).filter((k) => validKeys.includes(k))
  const useCase = USE_CASES.some((u) => u.key === decision.use_case) ? decision.use_case! : 'marketing'

  // ⚠️ Aucune variable déduite → le template serait un message FIGÉ, identique
  // pour tous les clients (« Bonjour, votre commande est confirmée »). C'est le
  // même bug vu par l'autre bout : un modèle sans variable ne sert à rien.
  //
  // On repose sur le cas d'usage, seule information fiable ici. Le prénom est
  // pertinent dans tous les cas ; on n'ajoute au-delà que ce dont le message a
  // structurellement besoin (un suivi de commande sans n° de commande n'a pas
  // de sens). On reste minimal : mieux vaut une variable de moins qu'une
  // variable hors sujet que Meta refuserait.
  if (variableKeys.length === 0) {
    const byUseCase: Record<string, string[]> = {
      // Suivi de commande : sans n° de commande, le message ne veut rien dire.
      order_status: ['customer_first_name', 'order_number', 'order_status_url'],
      // Panier : le lien de reprise EST la raison d'être du message.
      cart: ['customer_first_name', 'cart_url'],
      // Marketing / support / facturation : rien d'obligatoire au-delà du prénom.
      marketing: ['customer_first_name'],
      support: ['customer_first_name'],
      billing: ['customer_first_name', 'order_number'],
    }
    variableKeys = (byUseCase[useCase] || ['customer_first_name']).filter((k) => validKeys.includes(k))
    console.warn(`[templates/converse] aucune variable déduite (use_case=${useCase}) → repli: ${variableKeys.join(', ')}`)
  }
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
