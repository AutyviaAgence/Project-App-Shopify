'use client'

/**
 * `fetch` authentifié pour les pages EMBEDDED (admin Shopify).
 *
 * Dans l'iframe, aucun cookie n'est envoyé : l'identité passe par le SESSION TOKEN
 * fourni par App Bridge (`shopify.idToken()`), attaché en `Authorization: Bearer`.
 * Le serveur le vérifie (session-token.ts) et en dérive la boutique, puis le compte
 * Xeyo (créé automatiquement à la 1re visite).
 *
 * Hors iframe (dashboard web), App Bridge est absent → on retombe sur un fetch
 * normal avec cookies, ce qui permet aux mêmes routes de servir les deux mondes.
 */

type ShopifyGlobal = { idToken?: () => Promise<string> }

/** App Bridge est-il présent (= on est bien dans l'admin Shopify) ? */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  const s = (window as unknown as { shopify?: ShopifyGlobal }).shopify
  return typeof s?.idToken === 'function'
}

export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (typeof window !== 'undefined') {
    const s = (window as unknown as { shopify?: ShopifyGlobal }).shopify
    if (typeof s?.idToken === 'function') {
      try {
        const token = await s.idToken()
        const headers = new Headers(init.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers })
      } catch {
        // App Bridge indisponible → on tente quand même (cookies).
      }
    }
  }
  return fetch(input, init)
}
