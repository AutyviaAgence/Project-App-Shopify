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
  | 'order_delivered'
  | 'order_cancelled'
  | 'refund_created'
  | 'return_requested'
  | 'checkout_abandoned'
  | 'contact_opted_in'
  | 'optin_popup'
  | 'no_customer_reply'
  | 'message_read'
  | 'scheduled_date'
  | 'customer_birthday'
  | 'button_clicked'

export const TRIGGER_EVENTS: { value: TriggerEvent; label: string; description: string; group: string }[] = [
  // Commande
  { value: 'order_created', label: 'Commande créée', description: 'Dès qu’une commande est passée.', group: 'Commande' },
  { value: 'order_paid', label: 'Commande payée', description: 'Quand le paiement est confirmé.', group: 'Commande' },
  { value: 'order_fulfilled', label: 'Commande expédiée', description: 'Quand la commande est expédiée (suivi disponible).', group: 'Commande' },
  { value: 'order_delivered', label: 'Commande livrée', description: 'Quand le colis est livré au client (si le transporteur transmet l’info à Shopify).', group: 'Commande' },
  { value: 'order_cancelled', label: 'Commande annulée', description: 'Quand une commande est annulée.', group: 'Commande' },
  { value: 'refund_created', label: 'Remboursement', description: 'Quand un remboursement est émis.', group: 'Commande' },
  { value: 'return_requested', label: 'Demande de retour', description: 'Quand un client ouvre une demande de retour (SAV).', group: 'Commande' },
  { value: 'checkout_abandoned', label: 'Panier abandonné', description: 'Paiement non finalisé après un délai.', group: 'Commande' },
  // Contact
  { value: 'contact_opted_in', label: 'Opt-in reçu', description: 'Un client vient de s’abonner sur WhatsApp (peu importe la source : popup, checkout, page Merci). Idéal pour un message de bienvenue.', group: 'Contact' },
  { value: 'optin_popup', label: 'Opt-in via popup', description: 'Un client s’abonne spécifiquement via la popup WhatsApp du site (pas au checkout). Pour un message dédié aux visiteurs qui laissent leur numéro sur le site.', group: 'Contact' },
  // Conversation / temps
  { value: 'button_clicked', label: 'Clic sur un bouton', description: 'Le client clique sur un bouton « réponse rapide » d’un message (ex : « Suivre ma commande »).', group: 'Conversation' },
  { value: 'message_read', label: 'Message lu', description: 'Le client vient de lire un message envoyé (double coche bleue WhatsApp). Idéal pour relancer un lecteur silencieux.', group: 'Conversation' },
  { value: 'no_customer_reply', label: 'Pas de réponse client', description: 'Le client n’a pas répondu depuis un certain temps (relance SAV).', group: 'Conversation' },
  { value: 'scheduled_date', label: 'Date précise', description: 'À une date/heure choisie (campagne planifiée).', group: 'Planifié' },
  { value: 'customer_birthday', label: 'Anniversaire client', description: 'Le jour de l’anniversaire du client (si connu).', group: 'Planifié' },
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
  productTitles?: string[]     // titres des produits de la commande
  collections?: string[]       // collections des produits
  country?: string             // code ISO du pays (ex: FR)
  language?: string            // langue du client (ex: fr)
  // button_clicked : texte du bouton cliqué (Meta ne renvoie pas de payload
  // custom pour les quick-reply → on matche sur le libellé).
  buttonTitle?: string
  // Données par clé nommée pour résoudre les variables du template
  variables: Record<string, string>
  // Clé d'idempotence (ex: `${event}:${orderId}`)
  dedupKey?: string
}
