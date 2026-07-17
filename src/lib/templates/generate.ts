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
  // ⚠️ QUICK_REPLY manquait — et c'est le plus important des trois.
  //
  // Le générateur ne savait produire que des liens et des codes promo. Un
  // marchand demandait « un message avec 2 boutons Oui/Non » : le modèle créé
  // n'avait donc AUCUN bouton de réponse rapide, le parcours ne pouvait pas être
  // branché, et il s'arrêtait au premier message.
  //
  // C'est aussi le seul bouton qui rouvre la fenêtre de 24 h : un clic dessus est
  // un message entrant (un clic sur URL ne déclenche rien côté Meta).
  | { type: 'QUICK_REPLY'; text: string }
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
 * Libellés de boutons EXPLICITEMENT demandés dans l'objectif.
 *
 * Quand l'assistant de parcours décrit un message à créer, il cite les boutons
 * entre guillemets : « deux boutons : "Oui, je veux un code promo" et "Non,
 * montrez-moi d'autres produits" ». Ces libellés ne sont pas décoratifs — ce sont
 * eux qui portent les branches du parcours. Sans eux, le funnel s'arrête.
 *
 * On reste STRICT pour ne pas inventer : il faut que le texte parle de boutons,
 * et on ne retient que ce qui est entre guillemets. Un objectif qui mentionne un
 * produit entre guillemets ne doit pas devenir un bouton.
 */
function extractRequestedButtons(objective: string): string[] {
  if (!/bouton/i.test(objective)) return []

  // ⚠️ NE PAS TRAITER L'APOSTROPHE COMME UN GUILLEMET.
  //
  // Première version : la classe incluait ' et ’. Résultat sur « 'J'ai une
  // question' » → l'apostrophe de « J'ai » fermait la citation, et on extrayait
  // un bouton « J ». On ne retient donc que de VRAIS délimiteurs appariés :
  //   «…»   "…"   '…'  (guillemets simples typographiques ouvrant/fermant)
  // L'apostrophe droite (') et typographique (’) restent du TEXTE.
  //
  // Les guillemets SIMPLES ('…') sont nécessaires : c'est le format que l'IA
  // utilise en pratique (« deux boutons : 'Oui, je veux un code promo' et 'Non,
  // montrez-moi d'autres produits' »). Mais ils s'apparient de travers avec les
  // apostrophes du français — d'où l'exigence d'un CONTEXTE : l'ouvrant doit
  // suivre un début de ligne, un espace ou une ponctuation d'introduction, et le
  // fermant être suivi d'une fin, d'un espace ou d'une ponctuation. Une
  // apostrophe interne (« montrez-moi d'autres ») ne satisfait ni l'un ni
  // l'autre, et n'est donc plus prise pour un délimiteur.
  const labels: string[] = []
  const patterns = [
    /«\s*([^«»]{2,40}?)\s*»/g,                    // français
    /"\s*([^"]{2,40}?)\s*"/g,                       // anglais typographique
    /"\s*([^"]{2,40}?)\s*"/g,                       // droit
    // ⚠️ Guillemets SIMPLES : on exige que l'ouvrant suive un espace/début et que
    // le fermant précède un espace/fin. Ça règle « J'ai une question » (dont
    // l'apostrophe est collée), mais PAS « Non, montrez-moi d'autres produits » —
    // l'apostrophe de « d'autres » est suivie d'une lettre… et précédée d'une
    // lettre aussi, donc elle ne peut pas être un fermant valide ici. C'est
    // exactement ce qu'on veut : on préfère RATER un libellé (le prompt demande
    // déjà de le produire) plutôt qu'en fabriquer un tronqué.
    /(?:^|[\s:(–—-])'([^']{2,40}?)'(?=$|[\s.,;:!?)])/gm,  // simple typographique
    /(?:^|[\s:(–—-])'((?:[^']|'(?=[a-zà-ÿ]))*?)'(?=$|[\s.,;:!?)])/gmi,  // simple droit, apostrophe interne tolérée
  ]
  // Deux libellés ne diffèrent pas par leur apostrophe : « J'ai » et « J’ai »
  // sont le même bouton. Sans cette normalisation on ajoutait un doublon.
  const norm = (s: string) => s.toLowerCase().replace(/[’ʼ]/g, "'").trim()

  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(objective)) !== null) {
      const text = (m[1] || '').trim()
      if (!text) continue
      // Un libellé est un appel à l'action COURT, pas un fragment de phrase.
      // On écarte donc ce qui trahit du texte ramassé au vol : une variable, une
      // fin de phrase, ou de la ponctuation en tête (« . Exemple : » était
      // extrait comme un bouton — l'ouvrant/fermant tombaient à cheval sur deux
      // citations voisines).
      if (/\{\{\d+\}\}/.test(text)) continue
      if (/[.!?]$/.test(text)) continue
      if (/^[.,;:!?)\]]/.test(text)) continue
      if (!/[a-zA-ZÀ-ÿ]/.test(text)) continue // au moins une lettre
      // ⚠️ « Copier le code » décrit un bouton COPY_CODE, pas une réponse rapide.
      //
      // Constaté : sur un funnel A/B, l'IA proposait « Copier le code de l'offre »
      // et « Non, montrez-moi d'autres produits ». On imposait les DEUX en
      // QUICK_REPLY et on retirait le vrai COPY_CODE — le marchand perdait son
      // code promo, et le libellé se retrouvait tronqué à 20 caractères
      // (« Copier le code de l' »). Un COPY_CODE ne branche rien de toute façon :
      // seul un quick-reply est capté par le webhook.
      if (/^(copier|copie[rz]?)\b|\bcode (promo|de l)/i.test(text)) continue
      const short = text.slice(0, 20)
      if (!labels.some((l) => norm(l) === norm(short))) labels.push(short)
    }
  }
  // Meta n'accepte qu'un nombre limité de boutons ; au-delà de 3, on a forcément
  // ramassé autre chose que des libellés → on préfère ne rien imposer.
  return labels.length > 3 ? [] : labels
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
- Boutons : texte ≤ 20 caractères. Trois types possibles :
  · QUICK_REPLY : bouton de RÉPONSE RAPIDE (« Oui, je veux », « Non merci »,
    « J'ai une question »). { "type":"QUICK_REPLY", "text":"…" } — pas d'url ni de code.
    ⚠️ C'est le SEUL bouton qui fasse répondre le client : son clic est un message
    entrant, il rouvre 24 h de discussion et permet de brancher la suite du parcours.
    Un clic sur URL, lui, ne déclenche rien côté WhatsApp.

    ⚠️⚠️ SI L'OBJECTIF DÉCRIT DES BOUTONS, REPRODUIS-LES À L'IDENTIQUE.
    Des libellés entre guillemets dans l'objectif (« Oui, je veux un code promo »,
    « Non, montrez-moi d'autres produits ») sont une COMMANDE, pas une suggestion :
    crée UN bouton QUICK_REPLY par libellé, avec ce texte exact (tronqué à 20
    caractères si besoin).
    N'essaie SURTOUT pas de « rendre service » en donnant tout de suite ce que le
    bouton promet : si l'objectif dit « bouton Oui pour recevoir un code promo »,
    NE mets PAS le code promo dans ce message — le code est la SUITE du parcours,
    envoyée après le clic. Mettre un COPY_CODE à la place du bouton Oui casse tout :
    le client n'a plus rien à cliquer, le parcours ne peut plus être branché et
    s'arrête là.
  · URL = lien réel (boutique ou produit fourni), jamais inventé.
  · COPY_CODE = un code promo court (ex : PROMO10).
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
  // ⚠️ BOUTONS EXIGÉS PAR L'OBJECTIF : on les extrait pour pouvoir les IMPOSER.
  //
  // Le prompt demande déjà de reproduire les libellés cités entre guillemets —
  // mais ce n'est qu'une consigne, et le modèle la contourne : testé sur « deux
  // boutons : "Oui, je veux un code promo" et "Non, montrez-moi d'autres
  // produits" », il rendait un COPY_CODE et AUCUN bouton de réponse. Il croit
  // rendre service en donnant le code tout de suite ; en réalité le client n'a
  // plus rien à cliquer, le parcours ne peut plus être branché, et il s'arrête au
  // premier message. C'est exactement le bug remonté par le marchand.
  //
  // On ne devine pas : on ne prend que les libellés explicitement cités entre
  // guillemets DANS une phrase qui parle de boutons.
  const requestedButtons = extractRequestedButtons(input.objective)

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
      // Réponse rapide : rien d'autre à valider que le libellé. C'est le bouton
      // qui permet de brancher un parcours — sans lui, la génération d'un
      // « message avec 2 boutons Oui/Non » rendait un message sans boutons.
      if (b?.type === 'QUICK_REPLY') {
        // ⚠️ Dédoublonnage à la SOURCE : le modèle produit parfois deux fois le
        // même libellé à l'apostrophe près (« J'ai une question » et « J’ai une
        // question »). Le client verrait deux boutons identiques, et le parcours
        // aurait deux branches pour la même intention.
        const dup = buttons.some(
          (x) => x.type === 'QUICK_REPLY'
            && x.text.toLowerCase().replace(/[’ʼ]/g, "'") === text.toLowerCase().replace(/[’ʼ]/g, "'")
        )
        if (dup) continue
        buttons.push({ type: 'QUICK_REPLY', text })
        continue
      }
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

    // ⚠️ ON IMPOSE LES BOUTONS EXIGÉS PAR L'OBJECTIF.
    //
    // S'ils manquent, le parcours ne peut pas être branché et s'arrête à ce
    // message : c'est le bug remonté (« les boutons ne sont pas mis et bloquent
    // le reste de l'automatisation »). On les ajoute donc nous-mêmes, avec le
    // libellé exact demandé.
    //
    // On retire au passage le COPY_CODE que le modèle met À LA PLACE du bouton
    // « Oui, je veux un code promo » : il donne le code tout de suite, alors que
    // le code est la SUITE du parcours — après le clic.
    if (requestedButtons.length > 0) {
      // ⚠️ Comparaison normalisée : « J'ai une question » (apostrophe droite) et
      // « J’ai une question » (typographique) sont le MÊME bouton. Sans ça, on
      // ajoutait un doublon à côté de celui que le modèle avait déjà produit.
      const norm = (s: string) => s.toLowerCase().replace(/[’ʼ]/g, "'").trim()
      const existing = new Set(
        buttons.filter((b) => b.type === 'QUICK_REPLY').map((b) => norm(b.text))
      )
      const missingLabels = requestedButtons.filter((l) => !existing.has(norm(l)))
      if (missingLabels.length > 0) {
        console.warn(`[templates/generate] boutons exigés absents → ajoutés : ${missingLabels.join(', ')}`)

        // ⚠️ ON NE RETIRE LE COPY_CODE QUE SI UN BOUTON PROMET LE CODE.
        //
        // Cas légitime : le brief dit « bouton "Oui, je veux un code promo" » et
        // le modèle met un COPY_CODE à la place — il donne le code tout de suite,
        // alors que le code est la SUITE du parcours, après le clic. Là, il faut
        // le retirer, sinon il n'y a plus rien à cliquer.
        //
        // Mais on le retirait SYSTÉMATIQUEMENT. Constaté sur un funnel A/B : le
        // message donnait le code ET proposait « Non, montrez-moi d'autres
        // produits » — on supprimait le code promo du marchand pour rien.
        const promisesCode = missingLabels.some((l) => /oui|code promo|profite|réduction|remise/i.test(l))
        if (promisesCode) {
          for (let i = buttons.length - 1; i >= 0; i--) {
            if (buttons[i].type === 'COPY_CODE') buttons.splice(i, 1)
          }
          // Un compte à rebours EXIGE un COPY_CODE qu'on vient de retirer.
          if (type === 'limited_time_offer') type = 'standard'
        }
        for (const label of missingLabels) buttons.push({ type: 'QUICK_REPLY', text: label })
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
