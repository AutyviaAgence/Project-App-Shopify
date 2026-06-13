/**
 * Composant `limited_time_offer` à l'ENVOI d'un template "offre à durée limitée".
 *
 * Meta affiche un compte à rebours natif jusqu'à `expiration_time_ms`. On calcule
 * cette expiration au moment de l'envoi : maintenant + durée (heures).
 *
 *   { type: 'limited_time_offer',
 *     parameters: [ { type: 'limited_time_offer',
 *       limited_time_offer: { expiration_time_ms: <ms epoch> } } ] }
 *
 * Si une expiration explicite est fournie (campagne planifiée), on l'utilise ;
 * sinon on retombe sur la durée par défaut du template.
 */
export function buildLtoComponent(
  opts: { defaultHours?: number | null; expiresAtMs?: number | null; nowMs: number }
): { type: 'limited_time_offer'; parameters: unknown[] } {
  const hours = opts.defaultHours && opts.defaultHours > 0 ? opts.defaultHours : 24
  const expiration = opts.expiresAtMs && opts.expiresAtMs > opts.nowMs
    ? opts.expiresAtMs
    : opts.nowMs + hours * 60 * 60 * 1000
  return {
    type: 'limited_time_offer',
    parameters: [
      { type: 'limited_time_offer', limited_time_offer: { expiration_time_ms: Math.round(expiration) } },
    ],
  }
}
