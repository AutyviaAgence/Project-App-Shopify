import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { buildStoreContextPrompt } from '@/lib/shopify/sync'

/**
 * POST /api/agents/onboard
 *
 * Onboarding e-commerce PRÉ-REMPLI : génère une config d'agent SAV à partir de
 * l'ANALYSE de la boutique déjà en mémoire (nom, devise, pays, liens/politiques)
 * + le catalogue (produits/collections). Le marchand n'a plus qu'à confirmer.
 *
 * Entrée (facultative) : { objectives?: string[] } (SAV, conseil, conversion, fidélisation)
 * Sortie : { data: { name, description, objective, tone, languages, system_prompt } }
 */
const OBJECTIVE_LABELS: Record<string, string> = {
  sav: 'SAV commandes (suivi de livraison, retours, remboursements, annulations)',
  advice: 'Conseil produits (tailles, matières, disponibilité, recommandations à partir du catalogue)',
  conversion: 'Conversion (répondre aux objections, proposer des produits, récupérer les paniers)',
  loyalty: 'Fidélisation (suivi après-achat, demande d’avis, offres, réengagement)',
}

/**
 * Questions de test proposées au marchand pendant l'onboarding.
 *
 * ⚠️ POURQUOI CE FILTRE.
 *
 * Le modèle proposait des questions du type « Où en est ma commande #1234 ? ». Or ce
 * test tourne PENDANT L'INSCRIPTION : il n'existe ni commande, ni client, ni numéro de
 * suivi. L'agent répondait donc « je vais consulter notre système, un instant… » —
 * puis ne vérifiait rien. Il BLUFFAIT, et c'était la toute première impression que le
 * marchand avait de son agent.
 *
 * On ne garde donc que les questions portant sur ce que l'agent peut RÉELLEMENT
 * traiter ici : le catalogue et les politiques de la boutique, qu'il connaît déjà.
 *
 * Le prompt l'interdit déjà, mais un modèle peut désobéir : ce filtre est le garde-fou
 * qui, lui, ne se trompe pas. Il rattrape aussi les agents créés AVANT ce correctif.
 */
const ORDER_TALK =
  /\b(commande|colis|livraison\s+de\s+ma|suivi\s+de|tracking|num[ée]ro\s+de\s+commande|order|#\s*\d{3,})\b/i

function sanitizeSampleQuestions(raw: unknown, en = false): string[] {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim())
    .filter((q) => !ORDER_TALK.test(q))
    .slice(0, 2)

  // Le filtre a pu tout vider (modèle têtu). On ne laisse jamais le marchand devant un
  // champ vide : ces deux questions marchent sur n'importe quelle boutique, et l'agent
  // sait y répondre — il a le catalogue et les politiques.
  if (list.length === 0) {
    return en
      ? ['What are your delivery times?', 'Can I return an item?']
      : ['Quels sont vos délais de livraison ?', 'Je peux retourner un article ?']
  }
  return list
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // PAS de gate de plan ici : la génération d'onboarding est OFFERTE à tous
  // (décision produit). Elle ne consomme pas les crédits IA du marchand
  // (crédits = conversations WhatsApp) — seul le journal de coûts opérateur
  // (ai_usage_log) trace l'appel.

  const body = (await req.json().catch(() => ({}))) as { objectives?: string[]; locale?: string }
  // Langue de l'INTERFACE marchand : elle pilote les textes qu'il VOIT
  // (questions d'essai, system_prompt qu'il relit), pas la langue de reponse
  // aux clients — celle-la reste detectee au 1er message.
  const merchantEn = body.locale === 'en'
  const objectives = (body.objectives?.length ? body.objectives : ['sav', 'advice', 'conversion', 'loyalty'])
    .filter((o) => OBJECTIVE_LABELS[o])

  // Boutique connectée + analyse en mémoire.
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_name, shop_domain, country, store_context')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Aucune boutique Shopify connectée.' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeContextPrompt = store.store_context ? buildStoreContextPrompt(store.store_context as any) : ''

  // Échantillon de catalogue (pour déduire le secteur, le ton, les produits phares).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = await (supabase as any)
    .from('shopify_products').select('title, price').eq('user_id', user.id).order('position').limit(20)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: collections } = await (supabase as any)
    .from('shopify_collections').select('title').eq('user_id', user.id).order('position').limit(15)

  const shopName = store.shop_name || store.shop_domain
  const productList = (products || []).map((p: { title: string; price: string | null }) => `- ${p.title}${p.price ? ` (${p.price})` : ''}`).join('\n') || '(catalogue non disponible)'
  const collectionList = (collections || []).map((c: { title: string }) => `- ${c.title}`).join('\n') || '(aucune collection)'
  const objectivesText = objectives.map((o) => `- ${OBJECTIVE_LABELS[o]}`).join('\n')

  const SYSTEM = `Tu es un expert en agents SAV WhatsApp pour l'e-commerce. À partir de l'analyse d'une VRAIE boutique Shopify, tu génères la config d'un agent PRÊT À L'EMPLOI, spécialisé e-commerce. Tu déduis le SECTEUR, le TON DE MARQUE et les LANGUES à partir du catalogue et du contexte. Tu réponds UNIQUEMENT en JSON valide :
{
  "name": "nom court de l'agent (ex : Assistant <Boutique>)",
  "description": "une phrase décrivant son rôle",
  "objective": "sa mission en une phrase",
  "tone": "professional | friendly | casual (déduis le ton adapté à la marque)",
  "languages": ["fr", ...] (langues probables des clients d'après la boutique/le pays),
  "system_prompt": "prompt système COMPLET (voir structure)",
  "escalation_situations": "texte (4 à 8 lignes) décrivant les SITUATIONS où l'agent doit transférer à un conseiller humain, DÉDUITES des politiques de la boutique (retours, remboursements, délais, livraison, litiges) + bonnes pratiques e-commerce",
  "sample_questions": ["${merchantEn ? 'REDIGE CES QUESTIONS EN ANGLAIS. ' : ''}2 questions COURTES qu'un VRAI client de CETTE boutique poserait sur WhatsApp, à la 1re personne, pour tester l'agent. ⚠️ IMPÉRATIF : elles doivent porter UNIQUEMENT sur ce que l'agent peut RÉELLEMENT répondre ici et maintenant — le CATALOGUE (produits, prix, matières, tailles, stock, conseil) et les POLITIQUES de la boutique (livraison, délais, retours, remboursement, garantie, paiement). INTERDIT : toute question sur une COMMANDE, un COLIS, un SUIVI, un NUMÉRO DE COMMANDE, un compte ou une donnée personnelle. Ce test tourne pendant l'inscription du marchand : aucune commande, aucun client n'existe encore. L'agent répondrait « je vais vérifier… » et ne vérifierait rien — il bluffe, et c'est la 1re impression que le marchand a de lui. Ex. VALIDES : « Vous avez ce modèle en taille M ? », « Quels sont vos délais de livraison ? », « Je peux le retourner s'il ne me va pas ? ». Ex. INTERDITS : « Où en est ma commande #1024 ? », « Mon colis est arrivé ? »."]
}

Le system_prompt (texte brut, titres en MAJUSCULES, ≥500 mots, ${merchantEn ? 'ANGLAIS' : 'français'}) couvre :
ROLE ET OBJECTIF, assistant e-commerce de la boutique, ce qu'il fait (SAV, conseil produit, conversion, fidélisation selon les objectifs).
LANGUE, détecte la langue du 1er message, répond dans cette langue, n'en change jamais.
IDENTITE, c'est une IA, le confirme si on lui demande.
TON ET STYLE, adapté à la marque, 1 question à la fois, pas de formules creuses.
SAV COMMANDES, suivi de livraison, retours, remboursements, annulations : s'appuie sur les outils/commandes, ne promet jamais un remboursement sans validation.
CONSEIL PRODUIT, recommande à partir du CATALOGUE réel (jamais inventer un produit/prix).
CONVERSION, répond aux objections, propose des produits pertinents, relance avec tact.
BASE DE CONNAISSANCES, catalogue, pages, politiques : consulte TOUJOURS, n'invente jamais. Si absent → transfert humain.
TRANSMISSION, quand escalader vers un conseiller.
FORMATS ENRICHIS, précise que l'agent peut, quand c'est pertinent, proposer des boutons de choix, partager des liens, envoyer des photos et présenter plusieurs produits sous forme de carrousel (le système fournit les balises à l'exécution ; ne pas détailler la syntaxe ici).
CE QUE TU NE FAIS JAMAIS, 8 à 12 interdits e-commerce concrets.

Pour "escalation_situations" : appuie-toi sur les POLITIQUES et PAGES listées (retours, remboursements, livraison, CGV) pour décrire des situations CONCRÈTES propres à cette boutique. Une situation par ligne, phrases courtes. Couvre au minimum : litige/désaccord sur un remboursement ou un retour hors des conditions de la boutique, réclamation sur un délai ou une commande non reçue/endommagée, client mécontent/agressif ou menace d'avis négatif ou de plainte, demande explicite de parler à un humain, et toute question sortant du périmètre (juridique, sur-mesure, gros volume). N'invente pas de politique : reste cohérent avec les liens fournis.`

  const userMsg = `BOUTIQUE : ${shopName}${store.country ? ` (${store.country})` : ''}
${storeContextPrompt}

CATALOGUE (échantillon) :
${productList}

COLLECTIONS :
${collectionList}

OBJECTIFS DE L'AGENT :
${objectivesText}

Génère la config de l'agent pour CETTE boutique.`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 3, timeout: 60_000 })
  const started = Date.now()
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
      temperature: 0.5,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'agent_generate', model: res.model || 'gpt-4o',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    const cfg = JSON.parse(res.choices[0]?.message?.content || '{}')
    const DEFAULT_SITUATIONS = `Le client est mécontent, agressif ou menace de laisser un mauvais avis ou de porter plainte.
Litige ou désaccord sur un remboursement ou un retour (hors des conditions de la boutique).
Réclamation sur un délai de livraison, une commande non reçue, incomplète ou endommagée.
Le client demande explicitement à parler à un conseiller humain.
Question hors du périmètre de l'agent (juridique, demande sur-mesure, gros volume).`
    return NextResponse.json({
      data: {
        name: cfg.name || `Assistant ${shopName}`,
        description: cfg.description || 'Agent SAV e-commerce',
        objective: cfg.objective || 'Aider les clients de la boutique',
        tone: ['professional', 'friendly', 'casual'].includes(cfg.tone) ? cfg.tone : 'friendly',
        languages: Array.isArray(cfg.languages) && cfg.languages.length ? cfg.languages : ['fr'],
        // La consigne de désabonnement n'est PAS ajoutée ici : cette route ne
        // fait que GÉNÉRER la config, que l'UI renvoie ensuite à POST /api/agents
        // — c'est là qu'elle est garantie (point unique, idempotent). L'ajouter
        // ici la dupliquerait au mieux, divergerait au pire.
        system_prompt: cfg.system_prompt || '',
        escalation_situations: (typeof cfg.escalation_situations === 'string' && cfg.escalation_situations.trim())
          ? cfg.escalation_situations.trim()
          : DEFAULT_SITUATIONS,
        sample_questions: sanitizeSampleQuestions(cfg.sample_questions, merchantEn),
        objectives,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Génération indisponible, réessayez.' }, { status: 502 })
  }
}
