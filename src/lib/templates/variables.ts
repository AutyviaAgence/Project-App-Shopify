/**
 * Catalogue des variables nommées pour les modèles WhatsApp.
 *
 * Meta n'accepte que des variables NUMÉRIQUES dans le corps ({{1}}, {{2}}…).
 * On expose à l'utilisateur des variables LISIBLES (Prénom client, N° commande…)
 * qui sont insérées comme {{n}}, et on mémorise le mapping (ordre = numéro) via
 * `variable_keys`. À l'envoi réel, chaque clé est résolue vers la vraie donnée.
 */

export type TemplateVariable = {
  key: string
  label: string
  group: 'Client' | 'Commande' | 'Liens' | 'Boutique'
  /** Exemple fourni à Meta pour la soumission (sample_values). */
  sample: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Client
  { key: 'customer_first_name', label: 'Prénom client', group: 'Client', sample: 'Marie' },
  { key: 'customer_last_name', label: 'Nom client', group: 'Client', sample: 'Dupont' },
  { key: 'customer_full_name', label: 'Nom complet client', group: 'Client', sample: 'Marie Dupont' },
  { key: 'customer_email', label: 'Email client', group: 'Client', sample: 'marie@email.com' },
  { key: 'customer_phone', label: 'Téléphone client', group: 'Client', sample: '+33 6 12 34 56 78' },
  // Commande
  { key: 'order_number', label: 'N° de commande', group: 'Commande', sample: '#1024' },
  { key: 'order_total', label: 'Montant de la commande', group: 'Commande', sample: '49,90 €' },
  { key: 'order_date', label: 'Date de commande', group: 'Commande', sample: '12/06/2026' },
  { key: 'order_status', label: 'Statut de la commande', group: 'Commande', sample: 'Expédiée' },
  { key: 'tracking_number', label: 'N° de suivi', group: 'Commande', sample: 'LP00123456789' },
  // Liens
  { key: 'order_status_url', label: 'Lien de suivi de commande (Shopify)', group: 'Liens', sample: 'https://boutique.exemple.com/orders/abc123' },
  { key: 'tracking_url', label: 'Lien de suivi du colis', group: 'Liens', sample: 'https://suivi.exemple.com/1024' },
  { key: 'cart_url', label: 'Lien du panier', group: 'Liens', sample: 'https://boutique.exemple.com/panier' },
  { key: 'store_url', label: 'Lien de la boutique', group: 'Liens', sample: 'https://boutique.exemple.com' },
  { key: 'review_url', label: "Lien d'avis", group: 'Liens', sample: 'https://avis.exemple.com' },
  // Boutique
  { key: 'store_name', label: 'Nom de la boutique', group: 'Boutique', sample: 'Ma Boutique' },
  { key: 'promo_code', label: 'Code promo', group: 'Boutique', sample: 'PROMO10' },
]

export const VARIABLE_BY_KEY: Record<string, TemplateVariable> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v])
)

/** Groupes ordonnés pour l'affichage dans le menu déroulant. */
export const VARIABLE_GROUPS = ['Client', 'Commande', 'Liens', 'Boutique'] as const

/** Contexte de données pour résoudre les variables à l'envoi. */
export type VariableContext = Partial<Record<string, string | null | undefined>>

/**
 * Résout les paramètres d'un template (dans l'ordre des variables nommées)
 * vers leurs vraies valeurs, à partir d'un contexte de données.
 * Une clé absente du contexte donne une chaîne vide (Meta exige un paramètre
 * non nul, on évite donc `undefined`).
 */
export function resolveVariables(
  variableKeys: string[],
  ctx: VariableContext
): string[] {
  return variableKeys.map((key) => {
    const raw = ctx[key]
    return (raw === undefined || raw === null) ? '' : String(raw)
  })
}
