import type { ConditionField, ConditionOp } from '@/lib/automations/graph-types'

/**
 * Champs de condition proposés dans l'UI.
 * `source` indique comment saisir la VALEUR :
 *  - undefined : saisie libre (number/text) ou booléen (oui/non)
 *  - 'country' | 'language' : liste fixe (cf. plus bas)
 *  - 'product' : liste des produits Shopify (chargée via /api/shopify/products)
 *  - 'collection' : liste des collections Shopify (/api/shopify/collections)
 */
export const CONDITION_FIELDS: {
  value: ConditionField
  /** Libellé FR par défaut — conservé pour l'usage SERVEUR (prompt IA de
   *  suggest/route.ts). L'UI marchand résout `labelKey` via t() au rendu. */
  label: string
  /** Clé i18n du libellé (`automations.builder.field_*`). */
  labelKey: string
  valueType: 'number' | 'boolean' | 'text'
  ops: ConditionOp[]
  placeholder?: string
  source?: 'country' | 'language' | 'product' | 'collection' | 'stage'
  /** Sélection multiple de valeurs (ex. plusieurs tags à la fois). */
  multi?: boolean
}[] = [
  { value: 'order_total', label: 'Montant de la commande (€)', labelKey: 'automations.builder.field_order_total', valueType: 'number', ops: ['>', '>=', '<', '<=', '==', '!='], placeholder: '50' },
  { value: 'is_first_order', label: 'Première commande', labelKey: 'automations.builder.field_is_first_order', valueType: 'boolean', ops: ['==', '!='] },
  { value: 'has_stage', label: 'Étape / Tag du contact', labelKey: 'automations.builder.field_has_stage', valueType: 'text', ops: ['has_any', 'has_none'], source: 'stage', multi: true },
  { value: 'product_contains', label: 'Produit contient', labelKey: 'automations.builder.field_product_contains', valueType: 'text', ops: ['contains', '!='], source: 'product' },
  { value: 'collection_contains', label: 'Collection contient', labelKey: 'automations.builder.field_collection_contains', valueType: 'text', ops: ['contains', '!='], source: 'collection' },
  { value: 'country', label: 'Pays du client', labelKey: 'automations.builder.field_country', valueType: 'text', ops: ['==', '!='], source: 'country' },
  { value: 'language', label: 'Langue du client', labelKey: 'automations.builder.field_language', valueType: 'text', ops: ['==', '!='], source: 'language' },
]

/** Pays e-commerce courants (code ISO 3166-1 alpha-2 → libellé FR + clé i18n). */
export const COUNTRY_OPTIONS: { value: string; label: string; labelKey: string }[] = [
  { value: 'FR', label: 'France', labelKey: 'automations.builder.country_FR' }, { value: 'BE', label: 'Belgique', labelKey: 'automations.builder.country_BE' }, { value: 'CH', label: 'Suisse', labelKey: 'automations.builder.country_CH' },
  { value: 'LU', label: 'Luxembourg', labelKey: 'automations.builder.country_LU' }, { value: 'MC', label: 'Monaco', labelKey: 'automations.builder.country_MC' }, { value: 'CA', label: 'Canada', labelKey: 'automations.builder.country_CA' },
  { value: 'GB', label: 'Royaume-Uni', labelKey: 'automations.builder.country_GB' }, { value: 'US', label: 'États-Unis', labelKey: 'automations.builder.country_US' }, { value: 'IE', label: 'Irlande', labelKey: 'automations.builder.country_IE' },
  { value: 'DE', label: 'Allemagne', labelKey: 'automations.builder.country_DE' }, { value: 'AT', label: 'Autriche', labelKey: 'automations.builder.country_AT' }, { value: 'NL', label: 'Pays-Bas', labelKey: 'automations.builder.country_NL' },
  { value: 'ES', label: 'Espagne', labelKey: 'automations.builder.country_ES' }, { value: 'PT', label: 'Portugal', labelKey: 'automations.builder.country_PT' }, { value: 'IT', label: 'Italie', labelKey: 'automations.builder.country_IT' },
  { value: 'MA', label: 'Maroc', labelKey: 'automations.builder.country_MA' }, { value: 'DZ', label: 'Algérie', labelKey: 'automations.builder.country_DZ' }, { value: 'TN', label: 'Tunisie', labelKey: 'automations.builder.country_TN' },
  { value: 'SN', label: 'Sénégal', labelKey: 'automations.builder.country_SN' }, { value: 'CI', label: "Côte d'Ivoire", labelKey: 'automations.builder.country_CI' }, { value: 'AU', label: 'Australie', labelKey: 'automations.builder.country_AU' },
]

/** Langues de contact (code → libellé FR + clé i18n). */
export const LANGUAGE_OPTIONS: { value: string; label: string; labelKey: string }[] = [
  { value: 'fr', label: 'Français', labelKey: 'automations.builder.lang_fr' }, { value: 'en', label: 'Anglais', labelKey: 'automations.builder.lang_en' }, { value: 'es', label: 'Espagnol', labelKey: 'automations.builder.lang_es' },
  { value: 'de', label: 'Allemand', labelKey: 'automations.builder.lang_de' }, { value: 'it', label: 'Italien', labelKey: 'automations.builder.lang_it' }, { value: 'pt', label: 'Portugais', labelKey: 'automations.builder.lang_pt' },
  { value: 'nl', label: 'Néerlandais', labelKey: 'automations.builder.lang_nl' },
]

/** Libellés FR par défaut des opérateurs (fallback + usages hors composant). */
export const OP_LABEL: Record<ConditionOp, string> = {
  '>': 'supérieur à', '>=': 'supérieur ou égal', '<': 'inférieur à', '<=': 'inférieur ou égal',
  '==': 'égal à', '!=': 'différent de', 'contains': 'contient',
  'has_any': 'a le tag', 'has_none': "n'a pas le tag",
}

/** Clés i18n des opérateurs (`automations.builder.op_*`), résolues via t(). */
export const OP_LABEL_KEY: Record<ConditionOp, string> = {
  '>': 'automations.builder.op_gt', '>=': 'automations.builder.op_gte', '<': 'automations.builder.op_lt', '<=': 'automations.builder.op_lte',
  '==': 'automations.builder.op_eq', '!=': 'automations.builder.op_neq', 'contains': 'automations.builder.op_contains',
  'has_any': 'automations.builder.op_has_any', 'has_none': 'automations.builder.op_has_none',
}
