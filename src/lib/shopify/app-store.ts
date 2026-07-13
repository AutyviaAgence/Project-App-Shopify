/**
 * Lien d'installation de l'app Shopify.
 *
 * ⚠️ Exigence App Store 2.3.1 — « Initiate installation from a Shopify-owned
 * surface » : l'app ne doit JAMAIS demander au marchand de saisir son domaine
 * `.myshopify.com`. C'est Shopify qui identifie la boutique (OAuth) ; une install
 * déclenchée par l'app à partir d'un domaine tapé à la main est un motif de rejet.
 *
 * Le marchand part donc TOUJOURS d'une surface Shopify : il clique « Installer »,
 * autorise, et revient chez nous via le callback OAuth — où `resolveXeyoUser()`
 * crée ou rattache son compte Xeyo.
 *
 * ── Deux valeurs selon la phase ────────────────────────────────────────────────
 * AVANT publication (aujourd'hui) : le lien d'installation du Dev Dashboard.
 *   `apps.shopify.com/xeyo` n'existe PAS tant que la fiche est en brouillon — y
 *   pointer donne un 404.
 * APRÈS publication : mettre `NEXT_PUBLIC_SHOPIFY_APP_STORE_URL` sur l'URL réelle
 *   de la fiche (https://apps.shopify.com/<handle>).
 *
 * ⚠️ `NEXT_PUBLIC_*` est INLINÉ AU BUILD : changer la variable dans Dokploy sans
 * reconstruire l'image ne change rien. D'où la valeur par défaut en dur ici.
 */
const DEV_DASHBOARD_INSTALL_URL =
  'https://admin.shopify.com/?organization_id=221859836&no_redirect=true' +
  '&redirect=/oauth/redirect_from_developer_dashboard?client_id%3Df9d37d1f9ab1427165874c33eb7c4926'

export const SHOPIFY_APP_STORE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_APP_STORE_URL || DEV_DASHBOARD_INSTALL_URL
