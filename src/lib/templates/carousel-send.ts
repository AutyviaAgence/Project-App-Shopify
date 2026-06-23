/**
 * Construction du composant `carousel` au moment de l'ENVOI d'un template.
 *
 * RÈGLE META (confirmée sur la définition réelle d'un template approuvé) :
 * le composant `carousel` ne transporte QUE les paramètres des variables {{n}}
 * présentes dans les cartes. Tout ce qui est figé (image d'en-tête approuvée,
 * texte de carte sans variable, bouton URL statique) est déjà dans le template
 * approuvé chez Meta et ne doit PAS être renvoyé.
 *
 * Conséquences :
 *  - Une carte SANS variable de body → on ne l'inclut PAS dans le composant
 *    (l'inclure avec un body vide déclenche 132012 « parameter format mismatch »,
 *    et `components: []` déclenche l'erreur 100 « cards.components is required »).
 *  - Si AUCUNE carte n'a de variable → on ne renvoie RIEN (null). Seul le body
 *    principal du template porte alors ses {{n}} (géré en amont).
 *  - Une carte AVEC variable(s) de body → { card_index, components: [ body ] }.
 *
 * (Les variables dans les boutons URL/header de carte ne sont pas gérées ici en
 * v1 — les modèles actuels ont des boutons/images figés.)
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
 * aucune carte n'a de variable (carrousel entièrement figé → rien à paramétrer).
 */
export function buildCarouselComponent(
  cards: SendCard[],
  ctx: VariableContext
): { type: 'carousel'; cards: unknown[] } | null {
  if (!Array.isArray(cards) || cards.length === 0) return null

  const outCards: { card_index: number; components: unknown[] }[] = []

  cards.forEach((card, idx) => {
    const varCount = countVars(card.body_text || '')
    if (varCount === 0) return // carte figée → omise (tout est dans le modèle approuvé)

    const keys = Array.isArray(card.body_variable_keys) ? card.body_variable_keys : []
    const resolved = resolveVariables(keys, ctx).slice(0, varCount)
    while (resolved.length < varCount) resolved.push('')
    outCards.push({
      card_index: idx,
      components: [
        { type: 'body', parameters: resolved.map((t) => ({ type: 'text', text: t })) },
      ],
    })
  })

  // Aucune carte paramétrée → pas de composant carousel.
  if (outCards.length === 0) return null
  return { type: 'carousel', cards: outCards }
}
