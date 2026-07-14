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

  // Déjà provisionnée ? Rien à faire — c'est le cas de la quasi-totalité des
  // requêtes, donc on sort avant tout appel réseau.
  const { data: existing } = await supabase
    .from('shopify_stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()
  if (existing?.access_token) return true

  // Managed install : la boutique n'existe pas encore. On l'obtient en échangeant
  // le session token que Shopify vient de nous donner.
  const exchanged = await exchangeSessionToken(shop, sessionToken)
  if (!exchanged.ok) {
    console.error('[ensure-store] token exchange échoué pour', shop, ':', exchanged.error)
    return false
  }

  const shopInfo = await fetchShopInfo(shop, exchanged.accessToken)
  const info = shopInfo.ok ? shopInfo.data.shop : null

  const { error } = await supabase.from('shopify_stores').upsert(
    {
      shop_domain: shop,
      access_token: encryptMessage(exchanged.accessToken),
      scopes: exchanged.scope,
      shop_name: info?.name ?? null,
      shop_email: info?.email ?? null,
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
  const wh = await registerWebhooks(shop, exchanged.accessToken)
  if (!wh.ok) console.error('[ensure-store] webhooks partiels pour', shop, ':', wh.errors)

  console.log('[ensure-store] boutique provisionnée par token exchange :', shop)
  return true
}
