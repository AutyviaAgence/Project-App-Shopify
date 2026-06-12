/**
 * Types et constantes du moteur d'automatisations.
 *
 * Une automation = un template branché sur un événement Shopify, avec un délai
 * (variable de temps), une fenêtre horaire et des conditions métier.
 */

export type TriggerEvent =
  | 'order_created'
  | 'order_paid'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'refund_created'
  | 'checkout_abandoned'

export const TRIGGER_EVENTS: { value: TriggerEvent; label: string; description: string }[] = [
  { value: 'order_created', label: 'Commande créée', description: 'Dès qu’une commande est passée.' },
  { value: 'order_paid', label: 'Commande payée', description: 'Quand le paiement est confirmé.' },
  { value: 'order_fulfilled', label: 'Commande expédiée', description: 'Quand la commande est expédiée (suivi disponible).' },
  { value: 'order_cancelled', label: 'Commande annulée', description: 'Quand une commande est annulée.' },
  { value: 'refund_created', label: 'Remboursement', description: 'Quand un remboursement est émis.' },
  { value: 'checkout_abandoned', label: 'Panier abandonné', description: 'Paiement non finalisé après un délai.' },
]

/** Conditions métier évaluées avant l'envoi. */
export type AutomationConditions = {
  /** Montant total minimum (devise de la boutique). */
  min_total?: number
  /** Montant total maximum. */
  max_total?: number
  /** N'envoyer qu'aux clients dont c'est la première commande. */
  first_order_only?: boolean
}

export type Automation = {
  id: string
  user_id: string
  name: string
  trigger_event: TriggerEvent
  template_id: string | null
  delay_minutes: number
  quiet_start: number | null
  quiet_end: number | null
  timezone: string
  conditions: AutomationConditions
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Contexte d'un événement (sert aux conditions ET au mapping de variables). */
export type EventContext = {
  contactId: string | null
  // Données brutes utiles aux conditions
  total?: number
  isFirstOrder?: boolean
  // Données par clé nommée pour résoudre les variables du template
  variables: Record<string, string>
  // Clé d'idempotence (ex: `${event}:${orderId}`)
  dedupKey?: string
}
