/**
 * Construction du composant `carousel` au moment de l'ENVOI d'un template.
 *
 * Pour un carrousel dont les cartes contiennent des variables {{n}}, Meta exige
 * un composant `carousel` listant, pour chaque carte, les paramètres résolus de
 * son BODY :
 *   { type: 'carousel', cards: [ { card_index, components: [ { type: 'body',
 *       parameters: [ { type: 'text', text: '...' } ] } ] } ] }
 *
 * Une carte SANS variable n'a pas besoin de paramètres → on l'omet (Meta affiche
 * le texte figé du template approuvé). Si AUCUNE carte n'a de variable, on ne
 * renvoie rien (carrousel statique → seul le body principal porte des params).
 */
import { resolveVariables, type VariableContext } from './variables'

export type SendCard = {
  body_text?: string
  body_variable_keys?: string[]
}

/** Nombre de variables {{n}} dans un texte. */
function countVars(text: string): number {
  const m = (text || '').match(/\{\{\s*(\d+)\s*\}\}/g)
  if (!m) return 0
  return Math.max(...m.map((x) => parseInt(x.replace(/\D/g, ''), 10)))
}

/**
 * Renvoie le composant `carousel` à ajouter aux components d'envoi, ou null si
 * aucune carte n'a de variable (carrousel statique).
 */
export function buildCarouselComponent(
  cards: SendCard[],
  ctx: VariableContext
): { type: 'carousel'; cards: unknown[] } | null {
  if (!Array.isArray(cards) || cards.length === 0) return null

  let hasAnyVar = false
  const outCards = cards.map((card, idx) => {
    const varCount = countVars(card.body_text || '')
    if (varCount === 0) {
      // Carte statique : pas de paramètres, mais Meta veut tout de même chaque
      // card_index présent quand on envoie un composant carousel.
      return { card_index: idx, components: [] as unknown[] }
    }
    hasAnyVar = true
    const keys = Array.isArray(card.body_variable_keys) ? card.body_variable_keys : []
    const resolved = resolveVariables(keys, ctx).slice(0, varCount)
    while (resolved.length < varCount) resolved.push('')
    return {
      card_index: idx,
      components: [
        { type: 'body', parameters: resolved.map((t) => ({ type: 'text', text: t })) },
      ],
    }
  })

  // Aucune carte n'a de variable → rien à paramétrer.
  if (!hasAnyVar) return null
  return { type: 'carousel', cards: outCards }
}
