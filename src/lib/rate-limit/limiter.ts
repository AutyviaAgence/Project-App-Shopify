/**
 * Rate limiter en mémoire avec fenêtre glissante
 * Simple et efficace pour les déploiements single-instance
 */

interface RateLimitEntry {
  count: number
  windowStart: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Nettoyage périodique des entrées expirées (toutes les 5 minutes)
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    }
  }

  /**
   * Vérifie et incrémente le compteur pour une clé donnée
   * @param key Identifiant unique (ex: user_id, ip_address)
   * @param limit Nombre maximum de requêtes autorisées
   * @param windowMs Durée de la fenêtre en millisecondes
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now()
    const entry = this.store.get(key)

    // Nouvelle fenêtre ou entrée expirée
    if (!entry || now - entry.windowStart >= windowMs) {
      this.store.set(key, { count: 1, windowStart: now })
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + windowMs,
      }
    }

    // Fenêtre existante
    const resetAt = entry.windowStart + windowMs

    if (entry.count >= limit) {
      // Limite atteinte
      const retryAfter = Math.ceil((resetAt - now) / 1000)
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      }
    }

    // Incrémenter le compteur
    entry.count++
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt,
    }
  }

  /**
   * Vérifie le statut sans incrémenter
   */
  peek(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + windowMs,
      }
    }

    const resetAt = entry.windowStart + windowMs
    const remaining = Math.max(0, limit - entry.count)

    return {
      allowed: entry.count < limit,
      remaining,
      resetAt,
      retryAfter: entry.count >= limit ? Math.ceil((resetAt - now) / 1000) : undefined,
    }
  }

  /**
   * Réinitialise le compteur pour une clé
   */
  reset(key: string): void {
    this.store.delete(key)
  }

  /**
   * Nettoie les entrées expirées
   */
  private cleanup(): void {
    const now = Date.now()
    const maxAge = 10 * 60 * 1000 // 10 minutes

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.windowStart > maxAge) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Arrête le nettoyage périodique (pour les tests)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }
}

// Singleton global
export const rateLimiter = new InMemoryRateLimiter()
