/**
 * Construction du composant `carousel` au moment de l'ENVOI d'un template.
 *
 * Pour un template carrousel, Meta exige TOUJOURS un composant `carousel`
 * listant CHAQUE carte par son `card_index` — même si les cartes n'ont pas de
 * variables. Omettre ce composant (ou n'envoyer que le body) déclenche l'erreur
 * 132012 « Parameter format does not match format in the created template ».
 *
 *   { type: 'carousel', cards: [ { card_index, components: [ { type: 'body',
 *       parameters: [ { type: 'text', text: '...' } ] } ] }, ... ] }
 *
 * Une carte SANS variable n'a pas de paramètres → `components: []`, mais elle
 * DOIT tout de même apparaître avec son `card_index` (Meta affiche alors le
 * texte figé approuvé pour cette carte).
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
 * Renvoie le composant `carousel` à ajouter aux components d'envoi.
 * Toujours présent dès qu'il y a au moins une carte (toutes les cartes sont
 * listées par card_index). Renvoie null seulement s'il n'y a aucune carte.
 */
export function buildCarouselComponent(
  cards: SendCard[],
  ctx: VariableContext
): { type: 'carousel'; cards: unknown[] } | null {
  if (!Array.isArray(cards) || cards.length === 0) return null

  const outCards = cards.map((card, idx) => {
    const varCount = countVars(card.body_text || '')
    // Meta EXIGE un tableau `components` non vide pour CHAQUE carte (sinon
    // erreur 100 « cards.components is required »). Une carte statique porte
    // donc un body avec des paramètres VIDES, pas un components vide.
    const keys = varCount > 0 && Array.isArray(card.body_variable_keys) ? card.body_variable_keys : []
    const resolved = resolveVariables(keys, ctx).slice(0, varCount)
    while (resolved.length < varCount) resolved.push('')
    return {
      card_index: idx,
      components: [
        { type: 'body', parameters: resolved.map((t) => ({ type: 'text', text: t })) },
      ],
    }
  })

  return { type: 'carousel', cards: outCards }
}
