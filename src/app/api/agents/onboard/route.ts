import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { canUseAi } from '@/lib/plans/gate'
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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAi(user.id)
  if (!gate.allowed) return NextResponse.json({ error: 'IA non disponible sur votre plan' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { objectives?: string[] }
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
  "system_prompt": "prompt système COMPLET (voir structure)"
}

Le system_prompt (texte brut, titres en MAJUSCULES, ≥500 mots, français) couvre :
ROLE ET OBJECTIF — assistant e-commerce de la boutique, ce qu'il fait (SAV, conseil produit, conversion, fidélisation selon les objectifs).
LANGUE — détecte la langue du 1er message, répond dans cette langue, n'en change jamais.
IDENTITE — c'est une IA, le confirme si on lui demande.
TON ET STYLE — adapté à la marque, 1 question à la fois, pas de formules creuses.
SAV COMMANDES — suivi de livraison, retours, remboursements, annulations : s'appuie sur les outils/commandes, ne promet jamais un remboursement sans validation.
CONSEIL PRODUIT — recommande à partir du CATALOGUE réel (jamais inventer un produit/prix).
CONVERSION — répond aux objections, propose des produits pertinents, relance avec tact.
BASE DE CONNAISSANCES — catalogue, pages, politiques : consulte TOUJOURS, n'invente jamais. Si absent → transfert humain.
TRANSMISSION — quand escalader vers un conseiller.
CE QUE TU NE FAIS JAMAIS — 8 à 12 interdits e-commerce concrets.`

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
    return NextResponse.json({
      data: {
        name: cfg.name || `Assistant ${shopName}`,
        description: cfg.description || 'Agent SAV e-commerce',
        objective: cfg.objective || 'Aider les clients de la boutique',
        tone: ['professional', 'friendly', 'casual'].includes(cfg.tone) ? cfg.tone : 'friendly',
        languages: Array.isArray(cfg.languages) && cfg.languages.length ? cfg.languages : ['fr'],
        system_prompt: cfg.system_prompt || '',
        objectives,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Génération indisponible, réessayez.' }, { status: 502 })
  }
}
