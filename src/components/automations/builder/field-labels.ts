import type { ConditionField, ConditionOp } from '@/lib/automations/graph-types'

/** Champs de condition proposés dans l'UI (libellés FR + type de valeur). */
export const CONDITION_FIELDS: {
  value: ConditionField
  label: string
  valueType: 'number' | 'boolean' | 'text'
  ops: ConditionOp[]
  placeholder?: string
}[] = [
  { value: 'order_total', label: 'Montant de la commande (€)', valueType: 'number', ops: ['>', '>=', '<', '<=', '==', '!='], placeholder: '50' },
  { value: 'is_first_order', label: 'Première commande', valueType: 'boolean', ops: ['==', '!='] },
  { value: 'product_contains', label: 'Produit contient', valueType: 'text', ops: ['contains', '!='], placeholder: 'nom du produit' },
  { value: 'collection_contains', label: 'Collection contient', valueType: 'text', ops: ['contains', '!='], placeholder: 'nom de la collection' },
  { value: 'country', label: 'Pays du client', valueType: 'text', ops: ['==', '!=', 'contains'], placeholder: 'FR' },
  { value: 'language', label: 'Langue du client', valueType: 'text', ops: ['==', '!='], placeholder: 'fr' },
]

export const OP_LABEL: Record<ConditionOp, string> = {
  '>': 'supérieur à', '>=': 'supérieur ou égal', '<': 'inférieur à', '<=': 'inférieur ou égal',
  '==': 'égal à', '!=': 'différent de', 'contains': 'contient',
}
