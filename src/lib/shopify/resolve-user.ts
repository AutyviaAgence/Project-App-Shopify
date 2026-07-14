import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * QUEL COMPTE XEYO PILOTE CETTE BOUTIQUE ?
 *
 * Cette fonction se contente de LIRE le lien. Elle n'en crée jamais.
 *
 * ── POURQUOI ELLE NE CRÉE PLUS RIEN ───────────────────────────────────────────
 *
 * Elle provisionnait auparavant un compte à partir de `shop_email` (l'email du
 * propriétaire de la boutique). C'était la racine d'un cercle vicieux :
 *
 *   · Un marchand inscrit sur Xeyo avec son Gmail perso installait l'app. Comme
 *     `shop_email` valait `contact@saboutique.com`, on ne le reconnaissait pas :
 *     on CRÉAIT un second compte à ce nom et on lui liait la boutique. Son vrai
 *     compte, lui, restait orphelin — et l'onboarding, qui attend une boutique
 *     liée à SON compte, tournait en boucle pour toujours.
 *
 *   · « Utiliser un autre compte » ne servait à rien : au rafraîchissement suivant,
 *     on reliait de nouveau la boutique au compte de `shop_email`.
 *
 * Le tort de fond : `shop.email` décrit la BOUTIQUE, pas la personne devant l'écran.
 * On s'en servait comme d'une identité. C'est faux, et ça imposait au marchand un
 * compte qu'il n'avait pas choisi.
 *
 * ── LE NOUVEAU CONTRAT ────────────────────────────────────────────────────────
 *
 * La liaison est désormais toujours un ACTE EXPLICITE du marchand, jamais une
 * déduction. Les seuls chemins qui écrivent `user_id` :
 *
 *   · /api/shopify/embedded/claim   — « créer mon compte » / « c'est bien moi »,
 *                                     depuis l'admin Shopify, sur identité VÉRIFIÉE
 *                                     par Shopify (associated_user.email_verified).
 *   · /api/shopify/connect          — le marchand, connecté au compte de son choix
 *                                     sur app.xeyo.io, réclame la boutique (link token).
 *
 * Ici, `null` ne veut pas dire « erreur » : il veut dire « personne n'a encore
 * choisi ». L'app embedded répond alors par l'écran de liaison — jamais par un 401.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type ResolvedUser = {
  userId: string
  created: boolean
}

/**
 * Renvoie le compte lié à la boutique, ou `null` si aucun ne l'est encore.
 * Ne crée jamais de compte, ne devine jamais une identité.
 */
export async function resolveXeyoUser(shop: string): Promise<ResolvedUser | null> {
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', shop)
    .eq('is_active', true)
    .maybeSingle()

  if (!store?.user_id) return null
  return { userId: store.user_id, created: false }
}
