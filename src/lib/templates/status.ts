/**
 * Ce qu'un STATUT de modèle autorise — un seul endroit pour ces règles.
 *
 * Un modèle WhatsApp passe par : draft → pending (revue Meta) → approved | rejected.
 *
 * ⚠️ SEUL UN MODÈLE `approved` PEUT ÊTRE ENVOYÉ.
 * Ce n'est pas notre choix mais celui de Meta, et c'est déjà appliqué à l'envoi
 * (dispatch.ts filtre sur `approved`). Le problème était que ce blocage était
 * SILENCIEUX : un parcours branché sur un brouillon s'activait sans broncher,
 * puis ne partait jamais, sans que le marchand comprenne pourquoi.
 *
 * D'où ces règles : on laisse CONSTRUIRE avec un brouillon (sinon il faudrait
 * attendre 24 h d'approbation Meta avant même de dessiner son parcours), mais on
 * refuse d'ACTIVER, et on le dit sur le nœud concerné.
 */

export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected'

/** Modèle utilisable pour CONSTRUIRE un parcours (pas forcément pour envoyer). */
export function isBuildableTemplate(t: { status: string }): boolean {
  return t.status === 'approved' || t.status === 'pending' || t.status === 'draft'
}

/** Modèle réellement ENVOYABLE : Meta n'accepte que l'approuvé. */
export function isSendableTemplate(t: { status: string }): boolean {
  return t.status === 'approved'
}

/**
 * Pourquoi ce modèle bloque l'activation — message destiné au marchand.
 * `null` = rien à signaler (le modèle est envoyable).
 */
export function templateBlockReason(status: string): string | null {
  switch (status) {
    case 'approved':
      return null
    case 'pending':
      return 'templates.block_reason.pending'
    case 'draft':
      return 'templates.block_reason.draft'
    case 'rejected':
      return 'templates.block_reason.rejected'
    default:
      return 'templates.block_reason.default'
  }
}

/** Libellé court, pour un badge sur le nœud. */
export function templateStatusLabel(status: string): string | null {
  switch (status) {
    case 'pending': return 'templates.status_label.pending'
    case 'draft': return 'templates.status_label.draft'
    case 'rejected': return 'templates.status_label.rejected'
    default: return null
  }
}
