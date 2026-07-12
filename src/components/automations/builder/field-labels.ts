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
  label: string
  valueType: 'number' | 'boolean' | 'text'
  ops: ConditionOp[]
  placeholder?: string
  source?: 'country' | 'language' | 'product' | 'collection' | 'stage'
  /** Sélection multiple de valeurs (ex. plusieurs tags à la fois). */
  multi?: boolean
}[] = [
  { value: 'order_total', label: 'Montant de la commande (€)', valueType: 'number', ops: ['>', '>=', '<', '<=', '==', '!='], placeholder: '50' },
  { value: 'is_first_order', label: 'Première commande', valueType: 'boolean', ops: ['==', '!='] },
  { value: 'has_stage', label: 'Étape / Tag du contact', valueType: 'text', ops: ['has_any', 'has_none'], source: 'stage', multi: true },
  { value: 'product_contains', label: 'Produit contient', valueType: 'text', ops: ['contains', '!='], source: 'product' },
  { value: 'collection_contains', label: 'Collection contient', valueType: 'text', ops: ['contains', '!='], source: 'collection' },
  { value: 'country', label: 'Pays du client', valueType: 'text', ops: ['==', '!='], source: 'country' },
  { value: 'language', label: 'Langue du client', valueType: 'text', ops: ['==', '!='], source: 'language' },
]

/** Pays e-commerce courants (code ISO 3166-1 alpha-2 → libellé FR). */
export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'FR', label: 'France' }, { value: 'BE', label: 'Belgique' }, { value: 'CH', label: 'Suisse' },
  { value: 'LU', label: 'Luxembourg' }, { value: 'MC', label: 'Monaco' }, { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'Royaume-Uni' }, { value: 'US', label: 'États-Unis' }, { value: 'IE', label: 'Irlande' },
  { value: 'DE', label: 'Allemagne' }, { value: 'AT', label: 'Autriche' }, { value: 'NL', label: 'Pays-Bas' },
  { value: 'ES', label: 'Espagne' }, { value: 'PT', label: 'Portugal' }, { value: 'IT', label: 'Italie' },
  { value: 'MA', label: 'Maroc' }, { value: 'DZ', label: 'Algérie' }, { value: 'TN', label: 'Tunisie' },
  { value: 'SN', label: 'Sénégal' }, { value: 'CI', label: "Côte d'Ivoire" }, { value: 'AU', label: 'Australie' },
]

/** Langues de contact (code → libellé FR). */
export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'fr', label: 'Français' }, { value: 'en', label: 'Anglais' }, { value: 'es', label: 'Espagnol' },
  { value: 'de', label: 'Allemand' }, { value: 'it', label: 'Italien' }, { value: 'pt', label: 'Portugais' },
  { value: 'nl', label: 'Néerlandais' },
]

export const OP_LABEL: Record<ConditionOp, string> = {
  '>': 'supérieur à', '>=': 'supérieur ou égal', '<': 'inférieur à', '<=': 'inférieur ou égal',
  '==': 'égal à', '!=': 'différent de', 'contains': 'contient',
  'has_any': 'a le tag', 'has_none': "n'a pas le tag",
}
