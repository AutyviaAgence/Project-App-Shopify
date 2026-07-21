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
  /** Libellé FR par défaut — conservé pour les usages SERVEUR (prompts IA de
   *  generate.ts / suggest) où le hook i18n n'existe pas. L'UI marchand résout
   *  plutôt `labelKey` via t() au moment du rendu. */
  label: string
  /** Clé i18n du libellé (`automations.builder.var_*`), résolue côté composant. */
  labelKey: string
  group: 'Client' | 'Commande' | 'Liens' | 'Boutique'
  /** Clé i18n du groupe (`automations.builder.var_group_*`). */
  groupKey: string
  /** Exemple fourni à Meta pour la soumission (sample_values). */
  sample: string
  /** Clé i18n de l'exemple, uniquement quand `sample` est une phrase à traduire
   *  (les données neutres comme « Marie » ou « #1024 » n'en ont pas). */
  sampleKey?: string
  /**
   * Le MARCHAND doit fournir cette valeur : rien dans les données ne peut la
   * deviner.
   *
   * La quasi-totalité des variables se résolvent toutes seules à l'envoi (le
   * prénom vient du contact, le n° de commande de Shopify…). Le code promo, lui,
   * n'existe nulle part : aucun déclencheur ne le porte — un anniversaire ne
   * « contient » pas de code. Sans saisie, le client recevait « utilisez le code
   * — » (le fallback), ce qui est pire que pas de message du tout.
   */
  merchantProvided?: boolean
  /** Aide affichée sous le champ de saisie (uniquement si merchantProvided). */
  hint?: string
  /** Clé i18n de l'aide (`automations.builder.var_hint_*`). */
  hintKey?: string
}

/** Variables que le marchand doit renseigner lui-même sur le bloc message. */
export function isMerchantProvided(key: string): boolean {
  return TEMPLATE_VARIABLES.some((v) => v.key === key && v.merchantProvided)
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Client
  { key: 'customer_first_name', label: 'Prénom client', labelKey: 'automations.builder.var_customer_first_name', group: 'Client', groupKey: 'automations.builder.var_group_client', sample: 'Marie' },
  { key: 'customer_last_name', label: 'Nom client', labelKey: 'automations.builder.var_customer_last_name', group: 'Client', groupKey: 'automations.builder.var_group_client', sample: 'Dupont' },
  { key: 'customer_full_name', label: 'Nom complet client', labelKey: 'automations.builder.var_customer_full_name', group: 'Client', groupKey: 'automations.builder.var_group_client', sample: 'Marie Dupont' },
  { key: 'customer_email', label: 'Email client', labelKey: 'automations.builder.var_customer_email', group: 'Client', groupKey: 'automations.builder.var_group_client', sample: 'marie@email.com' },
  { key: 'customer_phone', label: 'Téléphone client', labelKey: 'automations.builder.var_customer_phone', group: 'Client', groupKey: 'automations.builder.var_group_client', sample: '+33 6 12 34 56 78' },
  // Commande
  { key: 'order_number', label: 'N° de commande', labelKey: 'automations.builder.var_order_number', group: 'Commande', groupKey: 'automations.builder.var_group_order', sample: '#1024' },
  { key: 'order_total', label: 'Montant de la commande', labelKey: 'automations.builder.var_order_total', group: 'Commande', groupKey: 'automations.builder.var_group_order', sample: '49,90 €' },
  { key: 'order_date', label: 'Date de commande', labelKey: 'automations.builder.var_order_date', group: 'Commande', groupKey: 'automations.builder.var_group_order', sample: '12/06/2026' },
  { key: 'order_status', label: 'Statut de la commande', labelKey: 'automations.builder.var_order_status', group: 'Commande', groupKey: 'automations.builder.var_group_order', sample: 'Expédiée', sampleKey: 'automations.builder.var_sample_order_status' },
  { key: 'tracking_number', label: 'N° de suivi', labelKey: 'automations.builder.var_tracking_number', group: 'Commande', groupKey: 'automations.builder.var_group_order', sample: 'LP00123456789' },
  // Liens
  { key: 'order_status_url', label: 'Lien de suivi de commande (Shopify)', labelKey: 'automations.builder.var_order_status_url', group: 'Liens', groupKey: 'automations.builder.var_group_links', sample: 'https://boutique.exemple.com/orders/abc123' },
  { key: 'tracking_url', label: 'Lien de suivi du colis', labelKey: 'automations.builder.var_tracking_url', group: 'Liens', groupKey: 'automations.builder.var_group_links', sample: 'https://suivi.exemple.com/1024' },
  { key: 'cart_url', label: 'Lien du panier', labelKey: 'automations.builder.var_cart_url', group: 'Liens', groupKey: 'automations.builder.var_group_links', sample: 'https://boutique.exemple.com/panier' },
  { key: 'store_url', label: 'Lien de la boutique', labelKey: 'automations.builder.var_store_url', group: 'Liens', groupKey: 'automations.builder.var_group_links', sample: 'https://boutique.exemple.com' },
  { key: 'review_url', label: "Lien d'avis", labelKey: 'automations.builder.var_review_url', group: 'Liens', groupKey: 'automations.builder.var_group_links', sample: 'https://avis.exemple.com' },
  // Boutique
  { key: 'store_name', label: 'Nom de la boutique', labelKey: 'automations.builder.var_store_name', group: 'Boutique', groupKey: 'automations.builder.var_group_store', sample: 'Ma Boutique' },
  {
    key: 'promo_code', label: 'Code promo', labelKey: 'automations.builder.var_promo_code', group: 'Boutique', groupKey: 'automations.builder.var_group_store', sample: 'PROMO10',
    merchantProvided: true,
    hint: 'Le code de réduction créé dans Shopify (Réductions → Créer). Le même pour tous les clients de ce message.',
    hintKey: 'automations.builder.var_hint_promo_code',
  },
  // Interaction (clic de bouton)
  { key: 'button_title', label: 'Bouton cliqué', labelKey: 'automations.builder.var_button_title', group: 'Boutique', groupKey: 'automations.builder.var_group_store', sample: 'Suivre ma commande', sampleKey: 'automations.builder.var_sample_button_title' },
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

/**
 * Prénom du contact, quelle que soit la colonne renseignée.
 *
 * ⚠️ `contacts` a DEUX colonnes de nom : `name` (nom complet, posé par l'opt-in
 * et WhatsApp) et `first_name`/`last_name` (saisie manuelle, import). Tous les
 * producteurs de variables ne lisaient que `name` : un contact n'ayant que
 * `first_name` recevait « cher client » / « Hello there » alors que son prénom
 * était en base.
 */
export function contactFirstName(contact: {
  name?: string | null
  first_name?: string | null
} | null | undefined): string {
  if (!contact) return ''
  const fromName = (contact.name || '').trim().split(/\s+/)[0] || ''
  return fromName || (contact.first_name || '').trim()
}

/** Nom complet du contact, même logique de repli. */
export function contactFullName(contact: {
  name?: string | null
  first_name?: string | null
  last_name?: string | null
} | null | undefined): string {
  if (!contact) return ''
  const full = (contact.name || '').trim()
  if (full) return full
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
}
