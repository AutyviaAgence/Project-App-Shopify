import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { exchangeSessionToken, fetchShopInfo, registerWebhooks } from './client'
import { encryptMessage } from '@/lib/crypto/encryption'

/**
 * Provisionne la boutique au PREMIER accès embedded (managed install).
 *
 * ⚠️ LE PROBLÈME QUE ÇA RÉSOUT — à lire avant de toucher à ce fichier.
 *
 * Avec `use_legacy_install_flow = false` (managed install, le mode moderne et
 * celui que Shopify pousse), Shopify installe l'app **sans jamais appeler notre
 * callback OAuth** : il ouvre directement l'app embedded avec un session token.
 * `/api/shopify/callback` n'est donc jamais atteint — et c'est lui qui créait la
 * ligne `shopify_stores`.
 *
 * Résultat observé en prod : l'app apparaissait bien installée côté Shopify, mais
 * `shopify_stores` restait VIDE, `resolveXeyoUser()` renvoyait `null`, et l'app
 * affichait « Installation requise » indéfiniment. Blocage total, y compris pour
 * le reviewer.
 *
 * La solution officielle est le **token exchange** : on échange le session token
 * (que l'iframe nous fournit déjà) contre un access token Admin API, et on crée la
 * boutique à la volée — exactement ce que faisait le callback.
 *
 * Le callback OAuth reste en place : il sert au flux d'installation hérité et aux
 * réinstallations. Les deux chemins convergent sur la même ligne `shopify_stores`.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Garantit qu'une ligne `shopify_stores` existe et est active pour cette boutique.
 * Renvoie `true` si la boutique est prête (déjà présente, ou créée à l'instant).
 *
 * Ne lève jamais : un échec renvoie `false` et l'appelant affiche l'écran
 * « Installation requise » — le comportement d'avant, pas pire.
 */
export async function ensureStoreProvisioned(
  shop: string,
  sessionToken: string
): Promise<boolean> {
  const supabase = admin()

  // Déjà provisionnée ? Rien à faire — c'est le cas de la quasi-totalité des requêtes,
  // donc on sort avant tout appel réseau.
  //
  // ⚠️ DÉCOUPLAGE « provisionné » vs « email récupéré » — NE PAS re-fusionner.
  //
  // On sortait tôt SEULEMENT si `access_token ET shop_email` étaient présents. Mais
  // `shop_email` est une donnée client PROTÉGÉE que Shopify ne renvoie qu'après
  // approbation *Protected Customer Data* : tant qu'elle est en attente, `shop_email`
  // reste VIDE. Conséquence : cette fonction, appelée à CHAQUE navigation embedded,
  // refaisait un token exchange réseau (+ fetchShopInfo + registerWebhooks) à chaque
  // page. Un seul de ces appels qui traîne/timeout (ETIMEDOUT observé) faisait
  // retomber l'app sur « reconnectez votre boutique ». C'est le symptôme rapporté par
  // le reviewer (« connected, mais reconnect en naviguant »).
  //
  // La boutique est UTILISABLE dès qu'elle a un `access_token` valide (non expiré) :
  // on sort alors tôt. La récupération de l'email est un enrichissement best-effort
  // qu'on RE-tente au maximum une fois par heure (via updated_at), jamais à chaque
  // requête, et qui ne bloque JAMAIS l'accès.
  const { data: existing } = await supabase
    .from('shopify_stores')
    .select('id, access_token, shop_email, token_expires_at, updated_at')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const tokenValid =
    !!existing?.access_token &&
    (!existing.token_expires_at || new Date(existing.token_expires_at).getTime() > Date.now())

  if (tokenValid) {
    // Token OK → boutique utilisable. Si l'email manque encore, on retente son
    // enrichissement au plus une fois/heure, sans bloquer (best-effort, hors chemin
    // critique). Sinon on sort immédiatement.
    if (existing!.shop_email) return true
    const staleMs = existing!.updated_at ? Date.now() - new Date(existing!.updated_at).getTime() : Infinity
    if (staleMs < 60 * 60 * 1000) return true // retenté récemment : ne pas re-cogner Shopify
    // Email toujours manquant et pas retenté depuis 1h : on tombe dans le bloc
    // ci-dessous qui refait un exchange pour ré-essayer fetchShopInfo. Best-effort.
  }

  // Managed install : la boutique n'existe pas (ou son jeton est inexploitable).
  // On obtient un jeu de jetons EXPIRANTS en échangeant le session token.
  const exchanged = await exchangeSessionToken(shop, sessionToken)
  if (!exchanged.ok) {
    console.error('[ensure-store] token exchange échoué pour', shop, ':', exchanged.error)
    return false
  }
  const { accessToken, scope, refreshToken, expiresAt } = exchanged.tokens

  const shopInfo = await fetchShopInfo(shop, accessToken)
  const info = shopInfo.ok ? shopInfo.data.shop : null
  if (!shopInfo.ok) {
    // ⚠️ Ne PAS avaler cet échec : sans `shop_email`, `resolveXeyoUser()` refuse
    // de créer le compte, la boutique reste ORPHELINE (user_id NULL) et l'app
    // embedded affiche 0 contact / 0 agent — sans que rien ne dise pourquoi.
    console.error('[ensure-store] fetchShopInfo a échoué pour', shop, ':', shopInfo.error)
  } else if (!info?.email && !info?.contactEmail) {
    console.error('[ensure-store] shop.email absent pour', shop, '→ le compte ne pourra pas être créé')
  }

  const { error } = await supabase.from('shopify_stores').upsert(
    {
      shop_domain: shop,
      access_token: encryptMessage(accessToken),
      refresh_token: refreshToken ? encryptMessage(refreshToken) : null,
      token_expires_at: expiresAt,
      scopes: scope,
      shop_name: info?.name ?? null,
      // `email` (propriétaire) d'abord, `contactEmail` (public) en repli : sans
      // email, resolveXeyoUser() ne crée pas le compte et la boutique reste orpheline.
      shop_email: info?.email || info?.contactEmail || null,
      currency: info?.currencyCode ?? null,
      country: info?.billingAddress?.country ?? null,
      is_active: true,
      installed_at: new Date().toISOString(),
      uninstalled_at: null,
      // Installée depuis Shopify ⇒ facturation par la Billing API, jamais Stripe
      // (exigence 1.2.1 : facturer hors plateforme = suspension).
      billing_source: 'shopify',
    },
    { onConflict: 'shop_domain' }
  )
  if (error) {
    console.error('[ensure-store] upsert échoué pour', shop, ':', error.message)
    return false
  }

  // Webhooks métier (commandes, expéditions…) — best effort : une boutique sans
  // webhooks reste utilisable, on ne bloque pas l'accès pour autant.
  const wh = await registerWebhooks(shop, accessToken)
  if (!wh.ok) console.error('[ensure-store] webhooks partiels pour', shop, ':', wh.errors)

  console.log('[ensure-store] boutique provisionnée par token exchange :', shop)
  return true
}
