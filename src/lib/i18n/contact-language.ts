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

/** Langues supportées par l'app pour les templates. */
export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

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
