import type { ConditionRule } from './graph-types'
import type { EventContext } from './types'

/**
 * Évalue une condition du graphe contre les données d'un événement.
 * Retourne true (branche "yes") ou false (branche "no").
 */
export function evaluateCondition(rule: ConditionRule, ctx: EventContext): boolean {
  const { field, op, value } = rule

  switch (field) {
    case 'order_total':
      return compareNumber(ctx.total, op, Number(value))

    case 'is_first_order':
      // value attendu booléen ; op == / != ; défaut == true
      return op === '!=' ? ctx.isFirstOrder !== Boolean(value) : ctx.isFirstOrder === Boolean(value)

    case 'product_contains':
      return listContains(ctx.productTitles, String(value), op)

    case 'collection_contains':
      return listContains(ctx.collections, String(value), op)

    case 'country':
      return compareString(ctx.country, op, String(value))

    case 'language':
      return compareString(ctx.language, op, String(value))

    case 'has_stage': {
      // value = un ou plusieurs id d'étapes (tags). L'opérateur dit s'il faut
      // qu'AU MOINS UN soit présent (has_any, défaut) ou AUCUN (has_none).
      const wanted = Array.isArray(value)
        ? value.map(String)
        : (value != null ? [String(value)] : [])
      const owned = new Set(ctx.stageIds || [])
      const hasAny = wanted.some((id) => owned.has(id))
      return op === 'has_none' ? !hasAny : hasAny
    }

    default:
      return false
  }
}

function compareNumber(a: number | undefined, op: string, b: number): boolean {
  if (a == null || Number.isNaN(b)) return false
  switch (op) {
    case '>': return a > b
    case '>=': return a >= b
    case '<': return a < b
    case '<=': return a <= b
    case '==': return a === b
    case '!=': return a !== b
    default: return false
  }
}

function compareString(a: string | undefined, op: string, b: string): boolean {
  const x = (a || '').toLowerCase()
  const y = b.toLowerCase()
  switch (op) {
    case '==': return x === y
    case '!=': return x !== y
    case 'contains': return x.includes(y)
    default: return false
  }
}

function listContains(list: string[] | undefined, needle: string, op: string): boolean {
  const has = (list || []).some((s) => s.toLowerCase().includes(needle.toLowerCase()))
  return op === '!=' ? !has : has
}
