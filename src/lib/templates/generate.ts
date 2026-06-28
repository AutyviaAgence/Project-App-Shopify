import 'server-only'
import OpenAI from 'openai'
import { TEMPLATE_VARIABLES, VARIABLE_BY_KEY } from './variables'
import { USE_CASE_BY_KEY, type UseCaseKey } from './use-cases'

/**
 * Génération IA de templates WhatsApp.
 *
 * À partir d'un objectif, d'un ton, d'une catégorie e-commerce et des variables
 * souhaitées, on génère 3 propositions de corps de message CONFORMES aux règles
 * Meta : variables {{n}} numérotées contiguës, JAMAIS en début/fin du message,
 * ton commercial, ≤1024 caractères. On injecte aussi le contexte boutique
 * (nom, devise, liens) pour que le texte colle à l'enseigne du marchand.
 */

let client: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[generate] OPENAI_API_KEY requis')
  client = new OpenAI({ apiKey })
  return client
}

const TONES: Record<string, string> = {
  professional: 'professionnel et soigné',
  friendly: 'chaleureux et bienveillant',
  casual: 'décontracté et proche',
}

export type GenerateInput = {
  useCase: UseCaseKey
  objective: string
  tone: 'professional' | 'friendly' | 'casual'
  variableKeys: string[]
  storeContextPrompt?: string | null
}

export type GeneratedProposal = {
  body_text: string
  variable_keys: string[]
}

/** Numéros {{n}} présents dans un texte (ensemble ordonné, dédupliqué). */
function placeholderNums(text: string): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const m of text.match(/\{\{\s*\d+\s*\}\}/g) || []) {
    const n = parseInt(m.replace(/\D/g, ''), 10)
    if (!seen.has(n)) { seen.add(n); out.push(n) }
  }
  return out
}

/**
 * Renumérote les {{n}} d'un texte en 1..k contigus dans l'ordre d'apparition,
 * et renvoie le texte + les clés de variables réordonnées en conséquence.
 * Garde-fou : on ne garde que les variables réellement utilisées.
 */
function normalize(text: string, requestedKeys: string[]): GeneratedProposal {
  const order = placeholderNums(text)
  const remap = new Map<number, number>()
  order.forEach((oldN, i) => remap.set(oldN, i + 1))
  const body = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, d) => `{{${remap.get(parseInt(d, 10)) ?? d}}}`)
  // Les clés suivent l'ordre des {{n}} d'origine ; on les remappe sur 1..k.
  const keys = order.map((oldN) => requestedKeys[oldN - 1]).filter((k): k is string => !!k)
  return { body_text: body.trim(), variable_keys: keys }
}

/** Valide qu'un corps est exploitable (non vide, pas de {{n}} en début/fin).
    Meta refuse une variable suivie/précédée seulement de ponctuation ou
    d'espaces (ex : "...chez {{4}}." invalide) → il faut du vrai texte au bord. */
function isValidBody(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  if (/^[\s\p{P}]*\{\{\s*\d+\s*\}\}/u.test(t)) return false
  if (/\{\{\s*\d+\s*\}\}[\s\p{P}]*$/u.test(t)) return false
  if (t.length > 1024) return false
  return true
}

/**
 * Génère 3 propositions de templates. Renvoie un tableau (1 à 3) de propositions
 * valides. Lève une erreur si l'appel OpenAI échoue.
 */
export async function generateTemplates(input: GenerateInput): Promise<GeneratedProposal[]> {
  const uc = USE_CASE_BY_KEY[input.useCase]
  const toneLabel = TONES[input.tone] || TONES.professional

  // Catalogue des variables demandées, dans l'ordre → ce seront {{1}}, {{2}}…
  const wantedKeys = input.variableKeys.filter((k) => !!VARIABLE_BY_KEY[k])
  const varList = wantedKeys.length > 0
    ? wantedKeys.map((k, i) => `  {{${i + 1}}} = ${VARIABLE_BY_KEY[k].label} (ex : ${VARIABLE_BY_KEY[k].sample})`).join('\n')
    : '  (aucune variable demandée — n\'insère pas de {{n}})'

  // Quelques variables suggérées pour cette catégorie, pour aider le modèle.
  const allVars = TEMPLATE_VARIABLES.map((v) => `${v.label} → ${v.key}`).join(', ')

  const prompt = `Tu es un expert en messages WhatsApp e-commerce conformes aux règles Meta.
Génère EXACTEMENT 3 propositions DIFFÉRENTES de corps de message pour un modèle WhatsApp.

CATÉGORIE : ${uc?.label || input.useCase}
OBJECTIF : ${input.objective}
TON : ${toneLabel}

VARIABLES À UTILISER (insère-les avec {{n}} aux bons endroits, dans cet ordre) :
${varList}

${input.storeContextPrompt ? input.storeContextPrompt + '\n' : ''}
RÈGLES STRICTES (Meta) :
- Le message ne doit JAMAIS commencer ni finir par une variable {{n}}. Après la DERNIÈRE variable et avant la PREMIÈRE, il faut de VRAIS MOTS (pas seulement de la ponctuation ou un point). INTERDIT : "...chez {{4}}." ou "{{1}}, bonjour". CORRECT : "...chez {{4}}, à très vite !" ou "Bonjour {{1}}, ...". Termine toujours par une phrase de conclusion SANS variable.
- Utilise UNIQUEMENT les variables listées ci-dessus, avec leur numéro exact ({{1}}, {{2}}…). N'invente pas de variable.
- Numérotation contiguë à partir de {{1}}.
- 1024 caractères maximum par message, idéalement 2 à 4 phrases.
- Ton ${toneLabel}, naturel, sans emoji excessif (1 maximum).
- Adapte le texte à la boutique si un contexte boutique est fourni (mais ne mets pas le lien en dur sauf si une variable de lien est demandée).
- Les 3 propositions doivent être nettement différentes (angle, formulation).

Réponds UNIQUEMENT avec un objet JSON de la forme :
{ "proposals": [ { "body_text": "..." }, { "body_text": "..." }, { "body_text": "..." } ] }
Aucune autre clé, aucun commentaire.`

  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    store: false,
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  })

  const raw = res.choices[0]?.message?.content || ''
  let parsed: { proposals?: { body_text?: string }[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Réponse IA invalide')
  }

  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : []
  const out: GeneratedProposal[] = []
  for (const p of proposals) {
    const body = (p.body_text || '').trim()
    if (!isValidBody(body)) continue
    out.push(normalize(body, wantedKeys))
  }
  return out.slice(0, 3)
}
