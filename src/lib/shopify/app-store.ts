/**
 * Lien d'installation depuis le Shopify App Store.
 *
 * ⚠️ Exigence App Store 2.3.1 — « Initiate installation from a Shopify-owned
 * surface » : l'app ne doit JAMAIS demander au marchand de saisir son domaine
 * `.myshopify.com`. C'est Shopify qui identifie la boutique (OAuth / session
 * token) ; une install que l'app déclenche elle-même à partir d'un domaine tapé
 * à la main est un motif de rejet.
 *
 * Le marchand part donc TOUJOURS de la fiche App Store : il clique « Installer »
 * chez Shopify, autorise, et revient chez nous via le callback OAuth — où
 * `resolveXeyoUser()` crée ou rattache son compte Xeyo.
 *
 * Tant que l'app n'est pas publiée, `NEXT_PUBLIC_SHOPIFY_APP_STORE_URL` peut
 * pointer vers le lien d'installation direct fourni par le Partner Dashboard.
 */
export const SHOPIFY_APP_STORE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_APP_STORE_URL || 'https://apps.shopify.com/xeyo'
