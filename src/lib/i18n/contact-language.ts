/**
 * Détermination de la langue d'un contact pour l'envoi de templates WhatsApp.
 *
 * Les templates Meta sont identifiés par (nom + langue). On choisit la variante
 * linguistique selon la langue préférée du contact, déterminée par cascade :
 *   1. Shopify customer.locale (le plus fiable)
 *   2. pays → langue (fallback)
 *   3. langue détectée dans la conversation
 *   4. langue par défaut du marchand
 */

/** Langues supportées par l'app pour la détection de langue d'un contact. */
export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Langues dans lesquelles un modèle est décliné automatiquement (traduction IA).
 * Source de vérité unique partagée par l'éditeur, l'API de traduction et le
 * dispatch. Volontairement limitée à FR + EN : chaque langue = 1 soumission Meta
 * de plus, et Meta limite à ~100 soumissions de templates par heure (+ 250
 * templates par compte). Élargir cette liste suffit à ajouter des langues.
 */
export const TEMPLATE_LANGUAGES = ['fr', 'en'] as const
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number]

/** Libellés affichables des langues de template (UI). */
export const TEMPLATE_LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien',
}

/**
 * Normalise une locale (ex: 'fr-FR', 'de_DE', 'EN', 'pt-BR') en code court
 * supporté (ex: 'fr'). Renvoie null si non reconnu/non supporté.
 */
export function normalizeLocale(locale: string | null | undefined): string | null {
  if (!locale) return null
  const short = locale.trim().toLowerCase().split(/[-_]/)[0]
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(short) ? short : null
}

/**
 * Déduit une langue à partir d'un code pays ISO (ex: 'FR' → 'fr'). Couvre les
 * principaux pays e-commerce ; renvoie null si inconnu.
 */
const COUNTRY_TO_LANG: Record<string, string> = {
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', CH: 'fr', // (CH approximatif → fr majoritaire côté SAV FR)
  GB: 'en', US: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
  DE: 'de', AT: 'de',
  IT: 'it',
  PT: 'pt', BR: 'pt',
  NL: 'nl',
}

export function languageFromCountry(country: string | null | undefined): string | null {
  if (!country) return null
  return COUNTRY_TO_LANG[country.trim().toUpperCase()] || null
}

/**
 * Détection LÉGÈRE de la langue d'un texte (mots fréquents), sans appel IA — sûre
 * à exécuter dans le webhook. Renvoie un code court supporté ou null si incertain.
 * Volontairement conservatrice : on ne devine que si plusieurs marqueurs clairs.
 */
const LANG_MARKERS: Record<string, string[]> = {
  fr: ['bonjour', 'merci', 'commande', 'oui', 'non', 'salut', 'pourquoi', 'où', 'comment', 'svp', "s'il", 'vous', 'je', 'pouvez'],
  en: ['hello', 'thanks', 'thank', 'order', 'yes', 'please', 'where', 'how', 'the', 'you', 'can', 'my'],
  es: ['hola', 'gracias', 'pedido', 'sí', 'por favor', 'dónde', 'cómo', 'usted', 'quiero', 'puede'],
  de: ['hallo', 'danke', 'bestellung', 'ja', 'nein', 'bitte', 'wo', 'wie', 'ich', 'können', 'meine'],
  it: ['ciao', 'grazie', 'ordine', 'sì', 'per favore', 'dove', 'come', 'vorrei', 'può', 'mio'],
}

export function detectLanguage(text: string | null | undefined): string | null {
  if (!text) return null
  const t = ` ${text.toLowerCase()} `
  let best: { lang: string; score: number } | null = null
  for (const [lang, words] of Object.entries(LANG_MARKERS)) {
    let score = 0
    for (const w of words) if (t.includes(` ${w} `) || t.includes(`${w} `)) score++
    if (!best || score > best.score) best = { lang, score }
  }
  // On exige au moins 2 marqueurs pour éviter les faux positifs.
  return best && best.score >= 2 ? best.lang : null
}

/**
 * Cascade complète : renvoie la meilleure langue connue + sa source, ou null.
 */
export function resolveContactLanguage(opts: {
  shopifyLocale?: string | null
  country?: string | null
  conversationLang?: string | null
}): { language: string; source: 'shopify' | 'country' | 'conversation' } | null {
  const fromShopify = normalizeLocale(opts.shopifyLocale)
  if (fromShopify) return { language: fromShopify, source: 'shopify' }
  const fromCountry = languageFromCountry(opts.country)
  if (fromCountry) return { language: fromCountry, source: 'country' }
  const fromConv = normalizeLocale(opts.conversationLang)
  if (fromConv) return { language: fromConv, source: 'conversation' }
  return null
}
