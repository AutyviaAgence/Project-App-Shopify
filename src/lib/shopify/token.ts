import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { refreshAccessToken } from './client'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'

/**
 * Fournit un access token Shopify VALIDE, en le rafraîchissant si besoin.
 *
 * ⚠️ POURQUOI CE HELPER EXISTE — à lire avant de lire `access_token` en direct.
 *
 * Depuis décembre 2025, Shopify REFUSE les jetons non-expirants :
 *   403 « [API] Non-expiring access tokens are no longer accepted for the Admin
 *        API. Start using expiring offline tokens. »
 * Tous nos appels Admin échouaient donc en 403, y compris `{ shop { name } }` —
 * ce qui laissait la boutique sans nom ni email, donc orpheline, sans que rien ne
 * l'explique.
 *
 * Les jetons sont désormais EXPIRANTS : il faut les renouveler avec le
 * `refresh_token` (valable 90 j). Un appelant qui lit `access_token` directement en
 * base obtiendra tôt ou tard un jeton périmé et tombera en 403 EN SILENCE — crons,
 * webhooks, relances de panier compris. Passer par ici est la seule façon sûre.
 *
 * ⚠️ Shopify renvoie un NOUVEAU refresh token à chaque rafraîchissement : on
 * réécrit donc les deux, sinon le rafraîchissement suivant échoue.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Marge de sécurité : on renouvelle 5 min avant l'expiration réelle. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/**
 * Renvoie un access token utilisable pour cette boutique, ou `null` si c'est
 * impossible (boutique inconnue, jeton hérité sans refresh_token, refresh échoué).
 *
 * `null` signifie « il faut refaire un token exchange » : cela se produit à la
 * prochaine ouverture de l'app embedded (ensure-store.ts).
 */
export async function getValidAccessToken(shop: string): Promise<string | null> {
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()
  if (!store?.access_token) return null

  // Jeton encore valide ?
  const expiresAt = store.token_expires_at ? new Date(store.token_expires_at).getTime() : 0
  if (expiresAt && Date.now() + REFRESH_MARGIN_MS < expiresAt) {
    try {
      return decryptMessage(store.access_token)
    } catch {
      return null
    }
  }

  // Expiré (ou jeton hérité non-expirant, désormais refusé par Shopify).
  if (!store.refresh_token) {
    console.warn('[shopify/token] jeton périmé et aucun refresh_token pour', shop,
      '→ un nouveau token exchange est nécessaire (ouverture de l’app embedded)')
    return null
  }

  let refresh: string
  try {
    refresh = decryptMessage(store.refresh_token)
  } catch {
    return null
  }

  const res = await refreshAccessToken(shop, refresh)
  if (!res.ok) {
    console.error('[shopify/token] refresh échoué pour', shop, ':', res.error)
    return null
  }

  const { accessToken, refreshToken, expiresAt: newExp } = res.tokens
  await supabase
    .from('shopify_stores')
    .update({
      access_token: encryptMessage(accessToken),
      // Shopify émet un NOUVEAU refresh token à chaque fois : ne pas le réécrire
      // condamnerait le rafraîchissement suivant.
      refresh_token: refreshToken ? encryptMessage(refreshToken) : null,
      token_expires_at: newExp,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)

  console.log('[shopify/token] access token rafraîchi pour', shop)
  return accessToken
}
