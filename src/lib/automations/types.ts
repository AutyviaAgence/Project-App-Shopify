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

/** Quels déclencheurs proposer dans l'onglet Campagnes (marketing) vs
 *  Automatisations (transactionnel). Les statuts de commande sont
 *  transactionnels ; le reste (planifié, opt-in/bienvenue, clic de bouton,
 *  relances) sert au marketing. `checkout_abandoned` apparaît dans les DEUX
 *  (relance = marketing, mais déclencheur de commande). */
const MARKETING_TRIGGERS = new Set<TriggerEvent>([
  'scheduled_date', 'customer_birthday',
  'contact_opted_in', 'optin_popup',
  'button_clicked', 'message_read', 'no_customer_reply',
  'checkout_abandoned',
])
const TRANSACTIONAL_TRIGGERS = new Set<TriggerEvent>([
  'order_created', 'order_paid', 'order_fulfilled', 'order_delivered',
  'order_cancelled', 'refund_created', 'return_requested', 'checkout_abandoned',
])

/** Déclencheurs à proposer pour un onglet donné. */
export function triggersForKind(kind: 'marketing' | 'transactional') {
  const set = kind === 'marketing' ? MARKETING_TRIGGERS : TRANSACTIONAL_TRIGGERS
  return TRIGGER_EVENTS.filter((e) => set.has(e.value))
}

/**
 * Déclencheurs qu'un MÊME contact peut refranchir → la récurrence a un sens, et
 * on la lui demande.
 *
 * Les autres sont bornés par nature : une commande donnée n'est payée qu'une
 * fois, une date précise n'arrive qu'une fois (`triggered_once_at`), un
 * anniversaire une fois l'an. Leur proposer un réglage n'aurait aucun effet et
 * laisserait croire qu'il en a un.
 *
 * ⚠️ `checkout_abandoned` en est ABSENT VOLONTAIREMENT. Il est bien répétable,
 * mais son occurrence — le panier, identifié par son token — le borne déjà : une
 * relance par panier abandonné. Lui appliquer le défaut « une seule fois »
 * n'aurait relancé un client que pour son PREMIER panier, jamais pour les
 * suivants : une perte de ventes silencieuse, à l'exact opposé du but.
 */
const REPEATABLE_TRIGGERS = new Set<TriggerEvent>([
  'no_customer_reply', 'message_read', 'button_clicked',
  'contact_opted_in', 'optin_popup',
])

export function isRepeatableTrigger(trigger: TriggerEvent): boolean {
  return REPEATABLE_TRIGGERS.has(trigger)
}

/**
 * Déclencheurs qui S'AUTO-NOURRISSENT : notre propre envoi peut les refranchir.
 *
 * `message_read` : on envoie → le client lit → nouveau message_read → on renvoie.
 * `no_customer_reply` : le silence ne s'épuise pas ; il dure tant qu'on n'a pas
 * de réponse, donc la condition reste vraie indéfiniment.
 *
 * Les deux ont réellement bouclé en production. On avertit avant de laisser un
 * marchand choisir « à chaque fois » là-dessus.
 */
const SELF_FEEDING_TRIGGERS = new Set<TriggerEvent>(['message_read', 'no_customer_reply'])

export function isSelfFeedingTrigger(trigger: TriggerEvent): boolean {
  return SELF_FEEDING_TRIGGERS.has(trigger)
}

/**
 * Onglet d'appartenance NATUREL d'un trigger (pour ranger une automatisation
 * créée automatiquement — ex. onboarding). Les statuts de commande sont
 * transactionnels ; tout le reste (opt-in/bienvenue, planifié, anniversaire,
 * relances, clic de bouton, panier abandonné) est une campagne marketing.
 * `checkout_abandoned` est dans les deux sets → on tranche MARKETING (relance).
 */
export function kindForTrigger(trigger: TriggerEvent): 'marketing' | 'transactional' {
  // Un trigger purement transactionnel (statut de commande, hors panier abandonné).
  if (TRANSACTIONAL_TRIGGERS.has(trigger) && trigger !== 'checkout_abandoned') return 'transactional'
  return 'marketing'
}

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
  stageIds?: string[]          // étapes/tags actuellement portés par le contact
                               // (condition has_stage). Chargé JIT par le cron.
  // button_clicked : texte du bouton cliqué (Meta ne renvoie pas de payload
  // custom pour les quick-reply → on matche sur le libellé).
  buttonTitle?: string
  // checkout_abandoned : jeton du panier Shopify. Stable d'un bout à l'autre du
  // panier (contrairement à l'id du checkout, réémis à chaque modification), il
  // sert à dédupliquer la relance ET à vérifier, au moment d'envoyer, que ce
  // panier précis n'a pas été payé entre-temps.
  cartToken?: string
  // checkout_abandoned : date de création du PANIER. Sert de référence au cron
  // pour juger « une commande est-elle arrivée depuis ? ». La date du job ne
  // convient pas : la commande peut la précéder (course de webhooks Shopify).
  cartCreatedAt?: string
  // Données par clé nommée pour résoudre les variables du template
  variables: Record<string, string>
  // Clé d'idempotence (ex: `${event}:${orderId}`)
  dedupKey?: string
}
