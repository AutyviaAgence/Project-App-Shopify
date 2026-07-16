import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { canUseAiOrOnboarding } from '@/lib/plans/gate'
import { GRAPH_JSON_SCHEMA_DOC, validateGraph, type WorkflowGraph } from '@/lib/automations/graph-types'
import { TRIGGER_EVENTS, triggersForKind } from '@/lib/automations/types'

/**
 * POST /api/automations/converse
 *
 * Assistant CONVERSATIONNEL de création de workflow (funnel), calqué sur
 * /api/templates/converse. L'IA pose 2 à 4 questions courtes, s'appuie sur les
 * modèles APPROUVÉS du marchand, puis génère un GRAPHE COMPLET (plusieurs
 * messages, délais, conditions, test A/B) — pas un simple trigger→message.
 *
 * Si un message manque pour réaliser le funnel demandé, l'IA le signale au lieu
 * d'inventer : on renvoie `missingTemplates` → l'UI affiche un bouton
 * « Créer ce modèle » qui redirige vers la page Modèles.
 *
 * Entrée : { messages: {role,content}[], kind?: 'marketing'|'transactional' }
 * Sortie :
 *   - { mode:'ask', question, options? }
 *   - { mode:'ready', graph, name, trigger, usedTemplates[], missingTemplates[] }
 *   - { mode:'need_templates', missingTemplates[], message }  → rien à générer
 */
type Msg = { role: 'user' | 'assistant'; content: string }

/**
 * Au-delà, on arrête de questionner.
 *
 * Le prompt annonce « 2 à 4 questions max », mais une consigne ne borne rien :
 * testé, le modèle a posé « Quel déclencheur ? » puis, deux tours plus tard,
 * « Pour clarifier, souhaitez-vous utiliser le déclencheur Opt-in reçu ? » — il
 * redemande ce qu'il vient de demander. Seul le code peut y mettre fin.
 */
const MAX_QUESTIONS = 4

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAiOrOnboarding(user.id)
  if (!gate.allowed) {
    return NextResponse.json({ error: 'L’assistant IA de création de workflow nécessite un plan payant.', upgrade: true }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[]; kind?: 'marketing' | 'transactional' }
  const messages = (body.messages || []).filter((m) => m && m.content?.trim()).slice(-20)
  const kind: 'marketing' | 'transactional' = body.kind === 'transactional' ? 'transactional' : 'marketing'

  // Modèles APPROUVÉS du marchand : seuls ceux-là sont envoyables → l'IA ne peut
  // construire le funnel qu'avec eux (sinon elle proposera d'en créer un).
  const { data: tpls } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, body_text, buttons, status, category')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .limit(60)
  const templates = (tpls || []) as { id: string; name: string; language: string; body_text: string | null; buttons: unknown; category: string | null }[]

  // Dédup par nom (les variantes linguistiques partagent le même name).
  const byName = new Map<string, typeof templates[number]>()
  for (const t of templates) if (!byName.has(t.name)) byName.set(t.name, t)
  const tplCatalog = Array.from(byName.values()).map((t) => {
    const qr = Array.isArray(t.buttons)
      ? (t.buttons as { type?: string; text?: string }[]).filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text).filter(Boolean)
      : []
    const body = (t.body_text || '').replace(/\s+/g, ' ').slice(0, 110)
    return `- id:"${t.id}" · ${t.name} [${t.category || 'UTILITY'}]${qr.length ? ` · boutons: ${qr.join(', ')}` : ''} · « ${body} »`
  }).join('\n') || '(aucun modèle approuvé pour le moment)'

  // Catalogue des déclencheurs : le LIBELLÉ humain est ce que l'IA doit montrer
  // au marchand ; le code technique ne sert QU'À remplir le champ "event" du
  // graphe (jamais affiché). Sans cette distinction, l'IA proposait des options
  // illisibles du type « contact_opted_in ».
  const triggerList = triggersForKind(kind)
    .map((e) => `- « ${e.label} » → event:"${e.value}" (${e.description})`)
    .join('\n')
  const kindLabel = kind === 'marketing' ? 'CAMPAGNE MARKETING' : 'AUTOMATISATION TRANSACTIONNELLE'

  const system = `Tu es un expert en funnels WhatsApp pour l'e-commerce. Tu aides un marchand à construire une ${kindLabel} complète.

Tu parles à un COMMERÇANT, pas à un développeur.
RÈGLE ABSOLUE : dans "question" et "options", n'écris JAMAIS de code technique
(pas de "contact_opted_in", "scheduled_date", "order_paid"…). Utilise UNIQUEMENT
des formulations humaines, en français courant. Les codes techniques ne servent
QUE dans le champ "event" du graphe JSON, jamais à l'écran.
  ✅ bon  : options: ["Quand un client abandonne son panier", "Quand quelqu'un s'abonne", "À une date précise"]
  ❌ interdit : options: ["checkout_abandoned", "contact_opted_in", "scheduled_date"]

Tu poses des questions COURTES, UNE À LA FOIS (2 à 4 max), pour comprendre :
 - l'objectif du parcours (relancer un panier, accueillir un abonné, réactiver un inactif, promouvoir…),
 - le rythme (combien de messages, quel espacement),
 - s'il veut tester deux versions d'un message (A/B).
Dès que tu as assez d'infos, tu passes en mode "ready".

# ⚠️ NE DEMANDE PAS LE DÉCLENCHEUR SI L'OBJECTIF LE DIT DÉJÀ

C'est l'erreur la plus fréquente, et elle exaspère : le marchand vient d'écrire
« relancer les paniers abandonnés », et on lui demande « quel déclencheur ? ».
Il l'a DÉJÀ dit. DÉDUIS-le, ne le fais pas répéter.

Correspondances évidentes — applique-les sans poser de question :
 - « panier abandonné », « pas fini leur commande », « panier oublié » → checkout_abandoned
 - « nouvel abonné », « bienvenue », « quelqu'un s'abonne » → contact_opted_in
 - « anniversaire » → customer_birthday
 - « à telle date », « samedi », « lundi matin », « le 12 » → scheduled_date
 - « client inactif », « qui n'achète plus », « qui ne répond plus », « réveiller », « réactiver »
   → no_customer_reply (⚠️ SURTOUT PAS contact_opted_in : un client inactif n'est pas
     quelqu'un qui vient de s'abonner — ce serait un contresens)
 - « clique sur un bouton » → button_clicked
 - « a lu le message » → message_read

Ne demande le déclencheur QUE si l'objectif reste réellement ambigu après lecture.
Et si tu l'as demandé une fois, NE LE REDEMANDE JAMAIS sous un autre angle : tranche
avec la correspondance la plus proche et avance.

DÉCLENCHEURS AUTORISÉS — la liste est EXHAUSTIVE pour cette ${kindLabel}.
N'utilise AUCUN autre code dans "event", même s'il existe ailleurs dans l'app : un
déclencheur hors de cette liste est rejeté, et le marchand se retrouve avec un
parcours sans déclencheur. Si aucun ne colle vraiment, prends le plus proche de
son objectif parmi ceux-ci — jamais un inventé.
(Montre le LIBELLÉ au marchand, mets le code dans event.)
${triggerList}

MODÈLES APPROUVÉS DISPONIBLES (n'utilise QUE ces id dans templateId) :
${tplCatalog}

${GRAPH_JSON_SCHEMA_DOC}

CONSIGNES IMPORTANTES :
- Un bon funnel ${kind === 'marketing' ? 'de vente enchaîne PLUSIEURS messages espacés par des délais, souvent avec une condition (« a-t-il commandé ? ») et parfois un test A/B' : 'transactionnel est court et informatif (1 à 2 messages)'}.
- N'INVENTE JAMAIS un templateId : utilise uniquement les id listés ci-dessus.
- S'il MANQUE un message pour réaliser le funnel (ex. pas de modèle de relance promo), NE l'invente pas.
  Mets alors templateId:null sur ce nœud ET décris-le dans "missingTemplates" :
    { "purpose": "à quoi sert ce message dans le parcours (1 phrase claire)",
      "suggestion": "CONSEILS CONCRETS POUR CONVERTIR : angle à adopter, incitation
                     (code promo, livraison offerte, urgence), boutons de réponse
                     rapide utiles, et un exemple de formulation courte." }
  Sois précis et actionnable : le marchand doit pouvoir créer le message directement
  à partir de ta suggestion.
- Si aucun modèle approuvé ne permet de démarrer, renvoie mode "need_templates".

# NE REPOSE JAMAIS DEUX FOIS LA MÊME QUESTION

Si le marchand répond à côté, évasivement (« je sais pas », « peu importe », « oui »)
ou ne tranche pas, tu ne reformules PAS : tu DÉCIDES à sa place et tu avances.
Reposer la question sous un autre angle le bloque en boucle — il n'obtient jamais
son parcours, c'est le pire échec possible.

Défauts à appliquer quand la réponse ne vient pas :
 - rythme non précisé → ${kind === 'marketing' ? '2 messages espacés de 24 h' : '1 message immédiat'}
 - A/B non demandé → pas de test A/B (garde le parcours simple)
 - déclencheur indécis → la correspondance la plus proche de l'objectif énoncé

Après 4 questions au total, tu passes en "ready" QUOI QU'IL ARRIVE, avec ces défauts.
Un parcours imparfait, que le marchand pourra ajuster dans l'éditeur, vaut infiniment
mieux qu'un interrogatoire sans fin.

Réponds UNIQUEMENT en JSON :
- Question : { "mode":"ask", "question":"...", "options":["...","..."] }   (options facultatives, 2-4)
- Prêt     : { "mode":"ready", "name":"nom du parcours", "graph":{ "nodes":[...], "edges":[...] },
              "explanation":"1-2 phrases décrivant le parcours créé",
              "missingTemplates":[{"purpose":"à quoi il sert","suggestion":"contenu suggéré"}] }
- Manque   : { "mode":"need_templates", "message":"...", "missingTemplates":[{"purpose":"...","suggestion":"..."}] }
La première fois (aucune réponse), pose une question d'ouverture simple.`

  // ⚠️ PLAFOND DUR. Passé 4 questions, on n'en pose plus : on EXIGE le parcours.
  //
  // Contrairement aux templates, on ne peut pas « forcer ready » côté serveur — il
  // faut un graphe, que seule l'IA produit. On lui coupe donc l'option de
  // questionner : une consigne finale, en dernier message, qu'elle ne peut pas
  // contourner en reformulant.
  const asked = messages.filter((m) => m.role === 'assistant').length
  const forceReady = asked >= MAX_QUESTIONS

  const chatMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    ...(forceReady
      ? [{
          role: 'user' as const,
          content:
            'STOP — tu as posé assez de questions. Ne pose PLUS AUCUNE question : ' +
            'génère maintenant le parcours avec ce que tu sais, en appliquant les défauts ' +
            '(déclencheur le plus proche de mon objectif, 2 messages espacés de 24 h, pas de test A/B). ' +
            'Réponds en mode "ready" avec un graphe complet, ou "need_templates" s’il manque vraiment un modèle.',
        }]
      : []),
  ]
  if (forceReady) console.warn(`[automations/converse] ${asked} questions posées → génération forcée`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 3, timeout: 60_000 })
  const started = Date.now()
  let decision: {
    mode?: 'ask' | 'ready' | 'need_templates'
    question?: string
    options?: string[]
    name?: string
    graph?: WorkflowGraph
    explanation?: string
    message?: string
    missingTemplates?: { purpose: string; suggestion: string }[]
  }
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o',           // graphe structuré → modèle plus fiable que mini
      messages: chatMessages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'campaign', model: res.model || 'gpt-4o',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    decision = JSON.parse(res.choices[0]?.message?.content || '{}')
  } catch {
    return NextResponse.json({ error: 'Échec de l’assistant. Réessayez.' }, { status: 502 })
  }

  const missing = Array.isArray(decision.missingTemplates)
    ? decision.missingTemplates.filter((m) => m?.purpose).slice(0, 4)
    : []

  // Manque de modèles pour construire quoi que ce soit.
  if (decision.mode === 'need_templates') {
    return NextResponse.json({
      mode: 'need_templates',
      message: decision.message || 'Il faut d’abord créer un modèle de message pour ce parcours.',
      missingTemplates: missing,
    })
  }

  // Question suivante. Filet de sécurité : si l'IA renvoie malgré tout un code
  // technique en option (« contact_opted_in »), on le traduit par son libellé
  // humain ; à défaut on l'écarte (jamais de jargon affiché au marchand).
  // Le tour forcé n'a RIEN produit d'exploitable → on ne repart pas pour un tour
  // de questions : on le dit franchement et on renvoie vers l'éditeur manuel.
  // Boucler serait pire que d'admettre l'échec.
  if (forceReady && (decision.mode !== 'ready' || !decision.graph)) {
    console.warn('[automations/converse] génération forcée sans graphe exploitable')
    return NextResponse.json({
      mode: 'need_templates',
      message:
        'Je n’ai pas réussi à cerner votre parcours. Décrivez-le en une phrase (ex. « relancer les paniers abandonnés avec 2 messages »), '
        + 'ou construisez-le directement dans l’éditeur — c’est souvent plus rapide.',
      missingTemplates: missing,
    })
  }

  if (decision.mode !== 'ready' || !decision.graph) {
    const labelByEvent = new Map(TRIGGER_EVENTS.map((e) => [e.value as string, e.label]))
    const humanOptions = (Array.isArray(decision.options) ? decision.options : [])
      .map((o) => {
        const s = String(o || '').trim()
        if (labelByEvent.has(s)) return labelByEvent.get(s)!         // code connu → libellé
        if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s)) return null     // snake_case inconnu → jeter
        return s
      })
      .filter((o): o is string => !!o)
      .slice(0, 4)
    return NextResponse.json({
      mode: 'ask',
      question: decision.question || 'Quel parcours souhaitez-vous créer ?',
      options: humanOptions.length > 0 ? humanOptions : undefined,
    })
  }

  // Prêt : on VALIDE le graphe produit par l'IA (elle peut halluciner un id ou
  // oublier une branche) avant de le renvoyer à l'UI.
  const graph = decision.graph
  const validIds = new Set(templates.map((t) => t.id))
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  // Un templateId inconnu = hallucination → on le neutralise (l'UI demandera au
  // marchand de choisir le modèle sur ce nœud).
  let hallucinated = 0
  for (const n of nodes) {
    if (n.type !== 'action') continue
    // ⚠️ Le modèle renvoie parfois la CHAÎNE "null" (ou "") au lieu du littéral
    // null pour dire « message à créer ». Sans ce filtre, on la comptait comme un
    // id halluciné : le compteur remonté à l'UI était donc faux, alors que l'IA
    // avait fait ce qu'on lui demandait.
    const raw = n.templateId as string | null
    if (raw === 'null' || raw === '') { n.templateId = null; continue }
    if (raw && !validIds.has(raw)) {
      n.templateId = null
      hallucinated++
    }
  }
  const errors = validateGraph(graph)
  // Les seules erreurs tolérées : action sans modèle (le marchand complètera).
  const blocking = errors.filter((e) => !/n'a pas de modèle/.test(e))
  if (blocking.length > 0) {
    return NextResponse.json({
      mode: 'ask',
      question: 'Je n’ai pas réussi à construire un parcours valide. Pouvez-vous préciser votre objectif ?',
    })
  }

  const trig = nodes.find((n) => n.type === 'trigger') as { event?: string } | undefined

  // ⚠️ Le déclencheur doit appartenir à la FAMILLE demandée (campagne vs
  // transactionnel). Le prompt ne présente déjà que ceux de la bonne famille,
  // mais rien ne vérifiait ce que l'IA renvoyait : elle pouvait donc poser un
  // déclencheur marketing sur une automatisation transactionnelle, qui
  // n'apparaîtrait alors même pas dans l'onglet où le marchand l'a créée.
  const allowedForKind = new Set(triggersForKind(kind).map((e) => e.value as string))
  let triggerOk = !!trig?.event
    && TRIGGER_EVENTS.some((e) => e.value === trig.event)
    && allowedForKind.has(trig.event)

  // Déclencheur hors famille (ou inventé) → on ne laisse PAS le marchand avec un
  // parcours sans déclencheur : on retombe sur celui de sa famille qui est le
  // point d'entrée le plus courant. Il reste modifiable d'un clic dans l'éditeur,
  // alors qu'un parcours sans déclencheur ne part jamais et n'explique pas
  // pourquoi. Constaté en test : « automatiser des trucs » en transactionnel
  // produisait contact_opted_in, qui est un déclencheur marketing.
  if (trig && !triggerOk) {
    const fallback = kind === 'marketing' ? 'checkout_abandoned' : 'order_paid'
    console.warn(`[automations/converse] déclencheur "${trig.event}" hors famille ${kind} → repli sur ${fallback}`)
    trig.event = fallback
    triggerOk = allowedForKind.has(fallback)
  }
  const usedTemplates = nodes
    .filter((n) => n.type === 'action' && n.templateId)
    .map((n) => (n as { templateId: string }).templateId)

  // Nœuds SANS modèle (l'IA n'en avait pas de valable, ou son id était halluciné).
  // Chacun doit être expliqué au marchand avec des conseils pour convertir : on
  // complète `missing` si l'IA n'a pas décrit assez de messages à créer.
  const emptyActions = nodes.filter((n) => n.type === 'action' && !n.templateId).length
  while (missing.length < emptyActions && missing.length < 4) {
    missing.push({
      purpose: `Message ${missing.length + 1} du parcours (à créer)`,
      suggestion:
        'Allez droit au but : rappelez le contexte (panier, commande, offre), donnez UNE raison d’agir maintenant '
        + '(code promo, livraison offerte, stock limité) et terminez par un bouton de réponse rapide '
        + '(ex. « Finaliser ma commande », « J’ai une question »). Un message court convertit mieux qu’un long.',
    })
  }

  return NextResponse.json({
    mode: 'ready',
    name: (decision.name || '').trim() || 'Nouveau parcours',
    graph,
    trigger: triggerOk ? trig!.event : null,
    explanation: (decision.explanation || '').trim(),
    usedTemplates,
    missingTemplates: missing,
    hallucinated, // nb de nœuds dont le modèle est à choisir par le marchand
  })
}
