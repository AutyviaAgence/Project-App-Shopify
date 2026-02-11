import 'server-only'

/**
 * File d'attente in-memory par session WhatsApp.
 * Sérialise les envois automatiques (IA, campagnes) pour éviter
 * d'envoyer plusieurs messages simultanément depuis le même numéro.
 *
 * Les envois manuels (user) ne passent PAS par cette queue.
 */

// Map sessionId → tail de la chaîne de Promises
const sessionChains = new Map<string, Promise<void>>()

/**
 * Exécute une fonction dans la queue sérialisée de la session.
 * Si delaySec > 0, attend ce délai AVANT d'exécuter fn.
 * Le premier appel passe immédiatement (la chaîne est résolue).
 * Les appels suivants attendent que le précédent finisse + délai.
 *
 * @param sessionId - ID de la session WhatsApp
 * @param delaySec - Secondes à attendre avant exécution (0 = pas d'attente)
 * @param fn - Fonction async à exécuter (ex: processAIResponse, sendMessage)
 * @returns Le résultat de fn
 */
export async function withSessionDelay<T>(
  sessionId: string,
  delaySec: number,
  fn: () => Promise<T>
): Promise<T> {
  if (delaySec <= 0) {
    // Pas de délai configuré, exécuter directement
    return fn()
  }

  const currentChain = sessionChains.get(sessionId) ?? Promise.resolve()

  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const resultPromise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  const newTail = currentChain
    .then(async () => {
      await new Promise(r => setTimeout(r, delaySec * 1000))
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
    .catch(() => {
      // Ne jamais casser la chaîne
    })

  sessionChains.set(sessionId, newTail)

  return resultPromise
}
