import 'server-only'
import OpenAI from 'openai'
import type { TemplateCard, TemplateButton, CardButton } from '@/types/database'

/**
 * Traduction automatique du CONTENU d'un modèle WhatsApp d'une langue vers une
 * autre, via OpenAI. Ne touche JAMAIS la base de données : reçoit le contenu
 * source, renvoie le contenu traduit. La persistance est gérée par l'appelant.
 *
 * Règle d'or : les variables {{n}} doivent rester IDENTIQUES (même nombre, mêmes
 * numéros). Un placeholder perdu ou ajouté casserait l'envoi (Meta #132000). On
 * ne fait donc pas confiance au modèle : on VALIDE après coup et on recopie la
 * source si les {{n}} ne correspondent pas.
 */

let client: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (client) return client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('[translate] OPENAI_API_KEY requis')
  client = new OpenAI({ apiKey })
  return client
}

const LANG_NAMES: Record<string, string> = {
  fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien',
  pt: 'portugais', nl: 'néerlandais',
}

/** Limites Meta par champ (caractères). */
const LIMITS = { body: 1024, header: 60, footer: 60, button: 25, card: 160, lto: 16 }

/** Contenu traduisible d'un modèle (source ET résultat ont cette forme). */
export type TranslatableContent = {
  body_text: string
  header_text?: string | null
  footer_text?: string | null
  buttons?: TemplateButton[] | null
  carousel_cards?: TemplateCard[] | null
  lto_title?: string | null
}

/** Extrait l'ensemble ordonné des numéros de variables {{n}} d'un texte. */
function placeholderSet(text: string | null | undefined): string {
  if (!text) return ''
  return (text.match(/\{\{\s*\d+\s*\}\}/g) || [])
    .map((m) => m.replace(/\D/g, ''))
    .join(',')
}

/**
 * Garde-fou : si la traduction n'a pas exactement les mêmes {{n}} que la source,
 * on rejette la traduction et on garde la source (mieux vaut une ligne non
 * traduite qu'un envoi cassé). Tronque aussi à la limite Meta.
 */
function safeField(source: string | null | undefined, translated: string | null | undefined, limit: number): string {
  const src = (source || '').trim()
  const tr = (translated || '').trim()
  if (!tr) return src
  if (placeholderSet(src) !== placeholderSet(tr)) {
    console.warn('[translate] {{n}} divergents → recopie de la source:', { src, tr })
    return src.slice(0, limit)
  }
  return tr.slice(0, limit)
}

/** Construit le prompt et appelle OpenAI pour UNE langue cible. */
async function callModel(source: TranslatableContent, sourceLang: string, targetLang: string): Promise<Record<string, unknown> | null> {
  // On n'envoie au modèle QUE les chaînes de texte naturel à traduire.
  const payload: Record<string, unknown> = { body_text: source.body_text }
  if (source.header_text) payload.header_text = source.header_text
  if (source.footer_text) payload.footer_text = source.footer_text
  if (source.lto_title) payload.lto_title = source.lto_title
  // Libellés des boutons (texte uniquement ; URL/code/phone copiés ailleurs).
  if (Array.isArray(source.buttons) && source.buttons.length > 0) {
    payload.button_texts = source.buttons.map((b) => b.text)
  }
  // Carrousel : on traduit body + libellés boutons de chaque carte.
  if (Array.isArray(source.carousel_cards) && source.carousel_cards.length > 0) {
    payload.cards = source.carousel_cards.map((c) => ({
      body_text: c.body_text,
      button_texts: (c.buttons || []).map((b) => b.text),
    }))
  }

  const prompt = `Tu es un traducteur professionnel pour des messages e-commerce WhatsApp.
Traduis le texte du ${LANG_NAMES[sourceLang] || sourceLang} vers le ${LANG_NAMES[targetLang] || targetLang}.

RÈGLES STRICTES :
- Traduis UNIQUEMENT le texte naturel. Conserve un ton commercial chaleureux et professionnel.
- NE MODIFIE JAMAIS les variables de la forme {{1}}, {{2}}, etc. : garde exactement le même nombre et les mêmes numéros, aux mêmes endroits logiques.
- Ne traduis PAS : les URLs, les codes promo, les noms de marque ou de produit.
- Conserve le formatage WhatsApp : *gras*, _italique_, ~barré~.
- Reste concis (limites : message ${LIMITS.body}, en-tête ${LIMITS.header}, pied ${LIMITS.footer}, bouton ${LIMITS.button}, carte ${LIMITS.card} caractères).
- IMPÉRATIF : le titre d'offre "lto_title" doit faire AU MAXIMUM ${LIMITS.lto} caractères (limite stricte Meta). Abrège si besoin (ex : "24h" au lieu de "24 hours", "-10%" gardé court). Compte les caractères avant de répondre.
- Réponds UNIQUEMENT avec un objet JSON ayant EXACTEMENT les mêmes clés que l'entrée (mêmes tableaux, même ordre). Aucune autre clé, aucun commentaire.

ENTRÉE :
${JSON.stringify(payload, null, 2)}`

  const openai = getOpenAI()
  const res = await openai.chat.completions.create({
    store: false,
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })
  const raw = res.choices[0]?.message?.content || ''
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    console.warn('[translate] réponse non-JSON pour', targetLang, raw.slice(0, 120))
    return null
  }
}

/**
 * Traduit le contenu d'un modèle vers une langue cible. Renvoie le contenu
 * traduit (avec garde-fous {{n}}), ou la source recopiée si l'appel échoue.
 */
export async function translateTemplateContent(args: {
  source: TranslatableContent
  sourceLang: string
  targetLang: string
}): Promise<TranslatableContent> {
  const { source, sourceLang, targetLang } = args
  let out: Record<string, unknown> | null = null
  try {
    out = await callModel(source, sourceLang, targetLang)
  } catch (e) {
    console.error('[translate] échec OpenAI pour', targetLang, e)
  }
  // Échec total → on renvoie la source telle quelle (l'appelant la persistera
  // comme brouillon à corriger ; pas d'envoi cassé).
  if (!out) return { ...source }

  const result: TranslatableContent = {
    body_text: safeField(source.body_text, out.body_text as string, LIMITS.body),
    header_text: source.header_text != null
      ? safeField(source.header_text, out.header_text as string, LIMITS.header)
      : source.header_text,
    footer_text: source.footer_text != null
      ? safeField(source.footer_text, out.footer_text as string, LIMITS.footer)
      : source.footer_text,
    lto_title: source.lto_title != null
      ? safeField(source.lto_title, out.lto_title as string, LIMITS.lto)
      : source.lto_title,
  }

  // Boutons : on garde la structure (type/url/code/phone) et on ne remplace que
  // le libellé `text` par la traduction validée.
  if (Array.isArray(source.buttons) && source.buttons.length > 0) {
    const texts = Array.isArray(out.button_texts) ? out.button_texts as string[] : []
    result.buttons = source.buttons.map((b, i) => ({
      ...b,
      text: safeField(b.text, texts[i], LIMITS.button),
    })) as TemplateButton[]
  } else {
    result.buttons = source.buttons ?? null
  }

  // Carrousel : structure conservée, body + libellés boutons traduits par carte.
  if (Array.isArray(source.carousel_cards) && source.carousel_cards.length > 0) {
    const cards = Array.isArray(out.cards) ? out.cards as { body_text?: string; button_texts?: string[] }[] : []
    result.carousel_cards = source.carousel_cards.map((c, i) => {
      const tc = cards[i] || {}
      const btnTexts = Array.isArray(tc.button_texts) ? tc.button_texts : []
      return {
        ...c,
        body_text: safeField(c.body_text, tc.body_text, LIMITS.card),
        buttons: (c.buttons || []).map((b, j) => ({
          ...b,
          text: safeField(b.text, btnTexts[j], LIMITS.button),
        })) as CardButton[],
      }
    })
  } else {
    result.carousel_cards = source.carousel_cards ?? null
  }

  return result
}
