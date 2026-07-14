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
      } catch (e) {
        // ⚠️ NE PAS avaler cette erreur en silence.
        //
        // Ce `catch` muet nous a coûté des heures : quand `idToken()` échoue, la
        // requête repart SANS en-tête Authorization, le serveur répond 401 et ne
        // logue rien (un appel sans token est un cas normal côté web). Dans
        // l'iframe, l'app affichait « Installation requise » sans qu'aucune trace
        // n'existe, ni côté client ni côté serveur.
        console.error(
          '[authenticatedFetch] shopify.idToken() a échoué — la requête part SANS session token, ' +
          'l’app embedded ne pourra pas s’authentifier :', e
        )
      }
    } else if (window.top !== window.self) {
      // On est dans une iframe mais App Bridge n'expose pas idToken : le script
      // CDN ne s'est pas initialisé (data-api-key vide/erroné, script bloqué…).
      console.error(
        '[authenticatedFetch] App Bridge absent dans l’iframe (window.shopify.idToken introuvable). ' +
        'Vérifier que app-bridge.js est chargé avec un data-api-key valide.'
      )
    }
  }
  return fetch(input, init)
}
