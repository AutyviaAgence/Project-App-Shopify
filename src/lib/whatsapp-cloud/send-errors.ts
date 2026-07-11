/**
 * Classification des erreurs d'envoi Meta, partagée entre le dispatch des
 * automatisations et l'exécuteur de campagnes (mêmes règles → même verdict).
 *
 * Un rate-limit N'EST PAS un échec : la fenêtre glissante de Meta libère de la
 * place, il faut REPROGRAMMER, pas marquer le destinataire en échec définitif.
 */

// Codes Meta de limitation d'envoi (palier 24h / anti-spam / paire).
const RATE_CODES = ['130429', '131048', '131056', '80007']

/** Extrait le code d'erreur Meta d'une réponse brute (JSON string). */
export function metaErrorCode(raw: string): string | undefined {
  return String(raw || '').match(/"code"\s*:\s*(\d+)/)?.[1]
}

/** Message Meta lisible (error_user_msg / message) pour le diagnostic. */
export function metaErrorMessage(raw: string): string {
  const s = String(raw || '')
  return s.match(/"error_user_msg"\s*:\s*"([^"]+)"/)?.[1]
    || s.match(/"message"\s*:\s*"([^"]+)"/)?.[1]
    || ''
}

/**
 * Vrai si l'erreur est une LIMITE D'ENVOI Meta (à reprogrammer, pas un échec).
 * Couvre les codes connus + « messaging limit reached » (dépassement de palier)
 * et les formulations libres « rate limit / too many ».
 */
export function isRateLimitError(raw: string): boolean {
  const s = String(raw || '')
  const code = metaErrorCode(s)
  if (code && RATE_CODES.includes(code)) return true
  return /rate.?limit|too many|messaging limit|limit reached|healthy ecosystem/i.test(s)
}
