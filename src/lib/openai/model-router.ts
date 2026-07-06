/**
 * Routeur de modèle IA — choisit gpt-4o-mini (économique) ou gpt-4o (qualité)
 * selon la sensibilité de la demande. Objectif : coût bas par défaut, qualité
 * maximale UNIQUEMENT là où l'enjeu le justifie (argent, satisfaction).
 *
 * Stratégie en 2 temps (voir process-ai-response) :
 *  1) PRÉ-SCAN par mots-clés du dernier message client → si demande sensible
 *     évidente (remboursement, annulation, litige…) → gpt-4o dès le départ.
 *  2) ESCALADE dynamique : si l'agent (parti en mini) demande un OUTIL sensible
 *     (remboursement/annulation/réduction) → on passe en gpt-4o pour la suite.
 */

export const MODEL_CHEAP = 'gpt-4o-mini'
export const MODEL_QUALITY = 'gpt-4o'

// Mots-clés (FR + EN) qui signalent une demande sensible → gpt-4o direct.
const SENSITIVE_KEYWORDS = [
  // Remboursement
  'rembours', 'refund', 'remboursé', 'reimburse',
  // Annulation
  'annul', 'cancel', 'résili', 'resilier',
  // Réclamation / litige
  'réclam', 'reclam', 'litige', 'plainte', 'complaint', 'dispute',
  'avocat', 'lawyer', 'juridique', 'legal', 'arnaque', 'scam', 'fraude', 'fraud',
  'insatisfait', 'mécontent', 'inacceptable', 'scandaleux',
  // Geste commercial / réduction (peut engager de l'argent)
  'code promo', 'réduction', 'reduction', 'discount', 'geste commercial', 'dédommage',
]

/**
 * Décide le modèle à utiliser AU DÉPART, à partir du dernier message client.
 * @param agentModel  le modèle configuré sur l'agent (respecté s'il force gpt-4o)
 * @param lastUserText le texte du dernier message du client
 */
export function pickInitialModel(agentModel: string, lastUserText: string | undefined): string {
  // Si le marchand a explicitement mis son agent en gpt-4o, on respecte (qualité max voulue).
  if (agentModel === MODEL_QUALITY) return MODEL_QUALITY

  const text = (lastUserText || '').toLowerCase()
  const sensitive = SENSITIVE_KEYWORDS.some((kw) => text.includes(kw))
  return sensitive ? MODEL_QUALITY : MODEL_CHEAP
}

/** Un appel d'outil sensible impose la qualité (gpt-4o) pour la suite. */
export function isSensitiveToolName(name: string): boolean {
  return name === 'request_refund' || name === 'request_cancel_order' || name === 'request_discount'
}
