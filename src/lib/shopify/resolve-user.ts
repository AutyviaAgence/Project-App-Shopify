import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * INSCRIPTION AUTOMATIQUE VIA SHOPIFY (« se connecter avec son compte Shopify »).
 *
 * Problème résolu : en app EMBEDDED, la requête ne porte aucun cookie Supabase —
 * l'identité vient du session token Shopify, qui identifie la BOUTIQUE (`dest`),
 * jamais un compte Xeyo. La seule clé de jointure est
 * `shopify_stores.shop_domain → user_id`, et ce `user_id` est NULL pour tout
 * nouveau marchand → impossible de l'identifier.
 *
 * Solution : à la première rencontre, on PROVISIONNE le compte Xeyo à partir de
 * l'email de la boutique (déjà collecté par fetchShopInfo → shop_email) :
 *   1. La boutique a déjà un user_id  → on le renvoie.
 *   2. Un compte Xeyo existe avec cet email → on RATTACHE (pas de doublon).
 *   3. Sinon → on CRÉE le compte (email confirmé, sans mot de passe) et on lie.
 *
 * Le marchand n'a donc JAMAIS à saisir d'email/mot de passe : installer l'app
 * depuis Shopify vaut inscription. Il peut définir un mot de passe plus tard
 * (récupération de compte) pour accéder à app.xeyo.io hors de l'admin.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type ResolvedUser = {
  userId: string
  /** true si le compte vient d'être créé (permet de déclencher l'onboarding). */
  created: boolean
}

/**
 * Renvoie le compte Xeyo de la boutique, en le CRÉANT si nécessaire.
 * `null` si la boutique n'existe pas / n'est pas installée, ou si aucun email
 * exploitable n'est disponible (on ne devine pas une identité).
 */
export async function resolveXeyoUser(shop: string): Promise<ResolvedUser | null> {
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, user_id, shop_email, shop_name, shop_domain, unlinked_at')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return null

  // 1) Boutique déjà liée à un compte.
  if (store.user_id) return { userId: store.user_id, created: false }

  // 1bis) DÉLIAISON VOLONTAIRE : ne PAS recréer le lien tout seul.
  //
  // Sans ce garde, il suffisait de rouvrir l'app dans l'admin Shopify pour que la
  // boutique se relie automatiquement au compte portant son `shop_email` — la
  // déconnexion était donc annulée à chaque rafraîchissement, et le marchand ne
  // pouvait JAMAIS changer de compte Xeyo (« Utiliser un autre compte » le ramenait
  // sur l'ancien, déjà reliphé entre-temps).
  //
  // Une boutique volontairement déliée reste orpheline jusqu'à une liaison
  // EXPLICITE : bouton « Relier ma boutique » (embedded/link-account) ou « Relier à
  // mon compte » depuis le dashboard (/api/shopify/connect). Les deux effacent
  // `unlinked_at`.
  if (store.unlinked_at) {
    console.log('[shopify/resolve-user] boutique volontairement déliée :', shop, '→ pas de liaison auto')
    return null
  }

  const email = (store.shop_email || '').trim().toLowerCase()
  if (!email) {
    // Sans email de boutique, on ne peut pas provisionner d'identité fiable.
    console.warn('[shopify/resolve-user] pas de shop_email pour', shop, '→ liaison impossible')
    return null
  }

  // 2) Un compte Xeyo existe-t-il déjà avec cet email ? (évite le doublon quand
  //    le marchand s'était inscrit sur app.xeyo.io avant d'installer l'app.)
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  let userId = existing?.id as string | undefined
  let created = false

  // 3) Sinon : création du compte (email confirmé, aucun mot de passe demandé).
  if (!userId) {
    const { data: made, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true, // l'email vient de Shopify → considéré vérifié
      user_metadata: {
        full_name: store.shop_name || store.shop_domain,
        signup_source: 'shopify',
        shop_domain: store.shop_domain,
      },
    })
    if (error || !made?.user?.id) {
      console.error('[shopify/resolve-user] création du compte échouée:', error?.message)
      return null
    }
    userId = made.user.id
    created = true
    // Le profil est créé par le trigger `on_auth_user_created` — rien à insérer.
  }

  // 4) Lier la boutique au compte. billing_source='shopify' : conformité App Store
  //    (facturation via la Billing API, jamais Stripe).
  await supabase
    .from('shopify_stores')
    .update({ user_id: userId, billing_source: 'shopify', updated_at: new Date().toISOString() })
    .eq('id', store.id)

  // 5) Auto-configuration de l'agent (catalogue → base de connaissances → agent).
  //    Best-effort : ne doit jamais bloquer l'accès à l'app.
  try {
    const { autoConfigureAgentFromShop } = await import('./sync')
    await autoConfigureAgentFromShop(store.id)
  } catch (e) {
    console.error('[shopify/resolve-user] auto-config agent échec (non bloquant):', e)
  }

  return { userId, created }
}
