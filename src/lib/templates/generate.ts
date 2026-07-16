import 'server-only'
import OpenAI from 'openai'
import { VARIABLE_BY_KEY } from './variables'
import { USE_CASE_BY_KEY, type UseCaseKey } from './use-cases'
import { logAiUsage } from '@/lib/openai/usage-log'

/**
 * Génération IA de templates WhatsApp RICHES.
 *
 * À partir d'un objectif, d'un ton, d'une catégorie et des variables souhaitées,
 * l'IA RECOMMANDE le format le plus pertinent (texte simple, boutons, offre
 * limitée, ou carrousel produits) et génère 3 propositions CONFORMES Meta.
 * Elle s'appuie sur le contexte boutique (nom/devise/liens) et, si dispo, sur de
 * VRAIS produits Shopify (titre/prix/url/image) pour les liens et carrousels.
 */

let client: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[generate] OPENAI_API_KEY requis')
  client = new OpenAI({ apiKey, maxRetries: 4, timeout: 60_000 })
  return client
}

const TONES: Record<string, string> = {
  professional: 'professionnel et soigné',
  friendly: 'chaleureux et bienveillant',
  casual: 'décontracté et proche',
}

export type GenProduct = { title: string; url: string | null; image_url: string | null; price: string | null }

export type GenerateInput = {
  useCase: UseCaseKey
  objective: string
  tone: 'professional' | 'friendly' | 'casual'
  variableKeys: string[]
  storeContextPrompt?: string | null
  products?: GenProduct[]
}

export type GenButton =
  | { type: 'URL'; text: string; url: string }
  | { type: 'COPY_CODE'; text: string; code: string }
export type GenCard = { title: string; body: string; image_url: string | null; url: string | null }

/** Une proposition générée, potentiellement riche. */
export type GeneratedProposal = {
  template_type: 'standard' | 'limited_time_offer' | 'carousel'
  body_text: string
  variable_keys: string[]
  buttons: GenButton[]
  lto_title?: string | null
  lto_hours?: number | null
  cards?: GenCard[]
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

/** Renumérote les {{n}} en 1..k et réordonne les clés en conséquence. */
function normalizeBody(text: string, requestedKeys: string[]): { body: string; keys: string[] } {
  const order = placeholderNums(text)
  const remap = new Map<number, number>()
  order.forEach((oldN, i) => remap.set(oldN, i + 1))
  const body = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, d) => `{{${remap.get(parseInt(d, 10)) ?? d}}}`)
  const keys = order.map((oldN) => requestedKeys[oldN - 1]).filter((k): k is string => !!k)
  return { body: body.trim(), keys }
}

/** Variable au bord = invalide (même suivie/précédée seulement de ponctuation). */
function bodyEdgeInvalid(text: string): boolean {
  const t = (text || '').trim()
  if (/^[\s\p{P}]*\{\{\s*\d+\s*\}\}/u.test(t)) return true
  if (/\{\{\s*\d+\s*\}\}[\s\p{P}]*$/u.test(t)) return true
  return false
}

const httpUrl = /^https?:\/\/.+\..+/i

/**
 * Cette URL est-elle un EXEMPLE du catalogue de variables, plutôt qu'un vrai lien ?
 *
 * Le prompt présente chaque variable avec un échantillon — « Lien de suivi du
 * colis (ex : https://suivi.exemple.com/1024) ». Le modèle confond l'exemple avec
 * une adresse utilisable et le place dans un bouton : le client cliquerait dans
 * le vide. On dérive les hôtes interdits du CATALOGUE lui-même, pour qu'un sample
 * ajouté plus tard soit couvert sans qu'on ait à y penser.
 */
const SAMPLE_HOSTS = new Set(
  Object.values(VARIABLE_BY_KEY)
    .map((v) => v.sample)
    .filter((s) => httpUrl.test(s))
    .map((s) => { try { return new URL(s).host.toLowerCase() } catch { return '' } })
    .filter(Boolean)
)
function isSampleUrl(url: string): boolean {
  try {
    return SAMPLE_HOSTS.has(new URL(url).host.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Génère jusqu'à 3 propositions riches. L'IA recommande le format ; on valide
 * et nettoie côté serveur pour rester conforme Meta.
 */
export async function generateTemplates(input: GenerateInput): Promise<GeneratedProposal[]> {
  const uc = USE_CASE_BY_KEY[input.useCase]
  const toneLabel = TONES[input.tone] || TONES.professional

  const wantedKeys = input.variableKeys.filter((k) => !!VARIABLE_BY_KEY[k])
  const varList = wantedKeys.length > 0
    ? wantedKeys.map((k, i) => `  {{${i + 1}}} = ${VARIABLE_BY_KEY[k].label} (ex : ${VARIABLE_BY_KEY[k].sample})`).join('\n')
    : '  (aucune variable demandée, n\'insère pas de {{n}})'

  // Produits réels disponibles (pour liens & carrousels). On n'en passe qu'un
  // échantillon avec URL publique (sinon inutilisable comme lien/carte).
  const usableProducts = (input.products || []).filter((p) => p.url && httpUrl.test(p.url)).slice(0, 8)
  const productsBlock = usableProducts.length > 0
    ? 'PRODUITS RÉELS DE LA BOUTIQUE (utilise UNIQUEMENT ceux-ci pour les liens/cartes, avec leur url et image exactes) :\n' +
      usableProducts.map((p, i) => `  ${i + 1}. ${p.title}${p.price ? `, ${p.price}` : ''}\n     url: ${p.url}\n     image: ${p.image_url || '(aucune)'}`).join('\n')
    : 'Aucun produit réel disponible → NE PROPOSE PAS de carrousel produits ; privilégie texte, boutons (lien boutique), ou offre limitée.'

  // ⚠️ La FAMILLE décide de ce qui est permis, et Meta refuse un modèle qui ment
  // sur sa nature : une promo (code, remise, compte à rebours) dans un message
  // déclaré UTILITY est rejetée. Le prompt ne le savait pas et proposait les
  // mêmes formats partout — il pouvait donc glisser un code promo dans une
  // confirmation de commande. On tranche depuis `metaCategory`, la source de
  // vérité, plutôt que de laisser l'IA deviner.
  const isMarketing = uc?.metaCategory === 'MARKETING'
  const familyRules = isMarketing
    ? `FAMILLE : CAMPAGNE (Meta MARKETING).
Le message cherche à faire acheter. Promotions, codes promo, remises, comptes à rebours
et mises en avant produit sont AUTORISÉS. Les 3 formats ci-dessous sont utilisables.`
    : `FAMILLE : TRANSACTIONNEL (Meta UTILITY).
Le message informe sur une commande EXISTANTE. Meta REJETTE tout contenu promotionnel ici.
INTERDIT, sans exception :
- aucun code promo, aucune remise, aucune offre, aucun compte à rebours ;
- aucune incitation à acheter (« profitez-en », « découvrez nos nouveautés », « -20 % ») ;
- format "limited_time_offer" INTERDIT ; bouton COPY_CODE INTERDIT ; carrousel produits INTERDIT.
AUTORISÉ : le format "standard" uniquement, avec au plus un bouton URL de suivi/consultation
de la commande. Contente-toi d'informer, clairement et sans rien vendre.`

  const prompt = `Tu es un expert en marketing WhatsApp e-commerce et en règles Meta.
Génère EXACTEMENT 3 propositions DIFFÉRENTES de message WhatsApp pour un modèle.
Pour CHAQUE proposition, RECOMMANDE toi-même le format le plus pertinent selon l'objectif.

${familyRules}

CATÉGORIE : ${uc?.label || input.useCase}
OBJECTIF : ${input.objective}
TON : ${toneLabel}

VARIABLES À UTILISER dans body_text (avec {{n}}, dans cet ordre) :
${varList}

${input.storeContextPrompt ? input.storeContextPrompt + '\n' : ''}
${productsBlock}

FORMATS POSSIBLES (choisis par proposition) :
- "standard" : un corps de message, éventuellement avec boutons (lien et/ou code promo).
- "limited_time_offer" : promo avec compte à rebours. EXIGE 2 boutons : un COPY_CODE (code promo) ET un URL (lien). Fournis aussi lto_title (≤16 caractères) et lto_hours.
- "carousel" : 2 à 5 cartes produits. CHAQUE carte doit avoir une image_url ET une url de produit RÉEL ci-dessus. À n'utiliser QUE si des produits réels sont fournis.

RÈGLES STRICTES (Meta), respecte-les SINON la proposition est rejetée :
- body_text : ne commence ni ne finit JAMAIS par une variable {{n}} ; il faut de VRAIS MOTS avant la 1re et après la dernière variable (pas seulement de la ponctuation). Termine par une phrase de conclusion sans variable.
- N'utilise QUE les variables listées, avec leur numéro exact. Numérotation contiguë depuis {{1}}.
- body_text ≤ 1024 caractères, 2 à 4 phrases.
- Boutons : texte ≤ 20 caractères. URL = lien réel (boutique ou produit fourni), jamais inventé. COPY_CODE = un code promo court (ex : PROMO10).
- ⚠️ Les « (ex : …) » de la liste des variables sont des EXEMPLES d'affichage, PAS des liens
  utilisables. Ne recopie JAMAIS une url d'exemple (suivi.exemple.com, boutique.exemple.com…)
  dans un bouton : elle ne mène nulle part, et le client cliquerait dans le vide. Quand
  l'information EST un lien (suivi, panier, commande), mets la variable {{n}} dans le
  CORPS du message et ne crée pas de bouton URL — l'adresse réelle n'existe qu'à l'envoi.
- Carrousel : pas de footer ; chaque carte body ≤ 160 caractères ; 0 à 1 bouton URL par carte (déjà inclus via l'url de carte).
- Les 3 propositions doivent être nettement différentes (format ou angle).

Réponds UNIQUEMENT avec ce JSON :
{ "proposals": [
  { "template_type": "standard|limited_time_offer|carousel",
    "body_text": "...",
    "buttons": [ { "type": "URL", "text": "...", "url": "https://..." }, { "type": "COPY_CODE", "text": "Copier le code", "code": "PROMO10" } ],
    "lto_title": "(si limited_time_offer)", "lto_hours": 24,
    "cards": [ { "title": "...", "body": "...", "image_url": "https://...", "url": "https://..." } ]
  }
] }
Omets buttons/cards/lto_* quand le format ne les utilise pas. Aucune autre clé, aucun commentaire.`

  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    store: false,
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  })

  void logAiUsage({
    feature: 'template_generate',
    model: res.model || 'gpt-4o-mini',
    promptTokens: res.usage?.prompt_tokens || 0,
    completionTokens: res.usage?.completion_tokens || 0,
  })

  const raw = res.choices[0]?.message?.content || ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { throw new Error('Réponse IA invalide') }

  const rawProposals = Array.isArray(parsed?.proposals) ? parsed.proposals : []
  const productUrls = new Set(usableProducts.map((p) => p.url))
  const out: GeneratedProposal[] = []

  for (const p of rawProposals) {
    const body = String(p?.body_text || '').trim()
    if (!body || body.length > 1024 || bodyEdgeInvalid(body)) continue
    const { body: normBody, keys } = normalizeBody(body, wantedKeys)

    let type: GeneratedProposal['template_type'] =
      ['standard', 'limited_time_offer', 'carousel'].includes(p?.template_type) ? p.template_type : 'standard'

    // ⚠️ GARDE-FOU (le prompt l'interdit déjà, mais ce n'est qu'une consigne).
    // En TRANSACTIONNEL, Meta rejette tout format promotionnel. On ne renvoie
    // donc jamais une proposition que la soumission refuserait : on la ramène au
    // format "standard" plutôt que de la laisser partir puis échouer chez Meta —
    // le marchand ne comprendrait pas le refus.
    if (!isMarketing && type !== 'standard') {
      console.warn(`[templates/generate] format ${type} interdit en UTILITY (${input.useCase}) → standard`)
      type = 'standard'
    }

    // Boutons valides uniquement.
    const buttons: GenButton[] = []
    for (const b of Array.isArray(p?.buttons) ? p.buttons : []) {
      const text = String(b?.text || '').trim().slice(0, 20)
      if (!text) continue
      if (b?.type === 'URL' && httpUrl.test(String(b.url || ''))) {
        // ⚠️ URL D'EXEMPLE recopiée depuis le catalogue de variables.
        //
        // Le prompt montre « (ex : https://suivi.exemple.com/1024) » pour
        // illustrer la variable ; le modèle prend l'exemple pour un lien
        // utilisable et le met dans le bouton. Constaté en test sur « colis
        // expédié » : les 3 propositions pointaient vers ce domaine bidon. En
        // production, de vrais clients auraient cliqué dans le vide.
        //
        // La liste vient du catalogue, pas d'un domaine codé en dur : un sample
        // ajouté demain sera couvert sans y penser.
        const url = String(b.url).trim()
        if (isSampleUrl(url)) {
          console.warn(`[templates/generate] URL d'exemple rejetée: ${url}`)
          continue
        }
        buttons.push({ type: 'URL', text, url })
      }
      else if (b?.type === 'COPY_CODE' && String(b.code || '').trim()) {
        // Un code promo dans un message transactionnel = rejet Meta assuré.
        if (!isMarketing) {
          console.warn(`[templates/generate] bouton COPY_CODE interdit en UTILITY (${input.useCase}) → retiré`)
          continue
        }
        buttons.push({ type: 'COPY_CODE', text, code: String(b.code).trim().slice(0, 15) })
      }
    }

    // Cartes carrousel : uniquement avec image + url de produit réel.
    let cards: GenCard[] | undefined
    if (type === 'carousel') {
      cards = (Array.isArray(p?.cards) ? p.cards : [])
        .filter((c: { image_url?: string; url?: string }) => c?.image_url && httpUrl.test(String(c.image_url)) && c?.url && productUrls.has(String(c.url)))
        .slice(0, 5)
        .map((c: { title?: string; body?: string; image_url?: string; url?: string }) => ({
          title: String(c.title || '').slice(0, 60),
          body: String(c.body || '').slice(0, 160),
          image_url: String(c.image_url),
          url: String(c.url),
        }))
      // Carrousel sans cartes valides → on rétrograde en standard.
      if (!cards || cards.length < 2) { type = 'standard'; cards = undefined }
    }

    // LTO : exige COPY_CODE + URL. Si manquant → rétrograde en standard.
    let ltoTitle: string | null | undefined
    let ltoHours: number | null | undefined
    if (type === 'limited_time_offer') {
      const hasCode = buttons.some((b) => b.type === 'COPY_CODE')
      const hasUrl = buttons.some((b) => b.type === 'URL')
      ltoTitle = String(p?.lto_title || '').trim().slice(0, 16) || null
      ltoHours = Number(p?.lto_hours) > 0 ? Number(p.lto_hours) : 24
      if (!hasCode || !hasUrl || !ltoTitle) type = 'standard'
    }

    out.push({
      template_type: type,
      body_text: normBody,
      variable_keys: keys,
      buttons,
      ...(type === 'limited_time_offer' ? { lto_title: ltoTitle, lto_hours: ltoHours } : {}),
      ...(type === 'carousel' ? { cards } : {}),
    })
  }
  return out.slice(0, 3)
}
