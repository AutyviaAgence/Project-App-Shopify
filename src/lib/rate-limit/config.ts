/**
 * Configuration des limites de taux par type d'endpoint
 */

export const RATE_LIMITS = {
  /** Routes standard : 100 requêtes par minute */
  STANDARD: { limit: 100, windowMs: 60_000 },

  /** Routes lourdes (knowledge upload, AI summary) : 10 requêtes par minute */
  HEAVY: { limit: 10, windowMs: 60_000 },

  /** Webhook : 1000 requêtes par minute (trafic élevé attendu) */
  WEBHOOK: { limit: 1000, windowMs: 60_000 },

  /** Authentification : 10 tentatives par minute */
  AUTH: { limit: 10, windowMs: 60_000 },

  /** Création de ressources : 30 par minute */
  CREATE: { limit: 30, windowMs: 60_000 },
} as const

export type RateLimitType = keyof typeof RATE_LIMITS
