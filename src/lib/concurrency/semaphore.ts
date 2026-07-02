import 'server-only'

/**
 * Sémaphore global in-memory, non-bloquant, par clé.
 *
 * Sert de garde-fou de concurrence : borne le nombre de traitements lourds
 * simultanés (ex. réponses IA) par process Node. Vit au niveau module (1 par
 * process, même modèle de vie que sessionChains dans messaging/session-queue).
 *
 * NON-BLOQUANT à dessein : le webhook ne doit JAMAIS attendre. `tryAcquire`
 * renvoie soit un `release()` (slot obtenu), soit `null` (gate pleine) — à
 * l'appelant de décider (traiter inline vs enfiler).
 */

// clé (ex: 'ai-reply') → nombre de slots occupés
const inFlight = new Map<string, number>()

/**
 * Tente d'acquérir un slot pour `key` sans bloquer.
 * @returns un `release()` idempotent si un slot était libre (< max), sinon null.
 */
export function tryAcquire(key: string, max: number): (() => void) | null {
  const cur = inFlight.get(key) ?? 0
  if (cur >= max) return null
  inFlight.set(key, cur + 1)

  let released = false
  return () => {
    if (released) return // idempotent : appelable plusieurs fois sans sous-compter
    released = true
    inFlight.set(key, Math.max(0, (inFlight.get(key) ?? 1) - 1))
  }
}

/** Nombre de slots occupés pour `key` (debug / monitoring). */
export function inFlightCount(key: string): number {
  return inFlight.get(key) ?? 0
}
