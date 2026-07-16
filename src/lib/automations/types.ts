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

/**
 * Mise en garde affichée sous un déclencheur dont l'événement ne dépend PAS de
 * nous — il peut ne jamais arriver, quoi qu'on fasse.
 *
 * Sans ça, le marchand construit une automatisation, ne voit rien partir, et
 * conclut logiquement à un bug de Xeyo. C'est arrivé sur les deux ci-dessous.
 */
export const TRIGGER_CAVEATS: Partial<Record<TriggerEvent, string>> = {
  // `fulfillment_events/create` (status='delivered') est émis quand le
  // TRANSPORTEUR confirme la livraison à Shopify. Beaucoup ne le font pas — et
  // sur une boutique de test, ça n'arrive à peu près jamais.
  order_delivered:
    'Dépend de votre transporteur : beaucoup ne transmettent pas la livraison à Shopify, et ce déclencheur ne part alors jamais. Pour un envoi fiable, préférez « Commande expédiée ».',
  // Shopify n'émet `orders/paid` qu'au paiement CAPTURÉ. Une commande créée à la
  // main dans l'admin reste en « Paiement en attente » → l'événement ne part pas.
  order_paid:
    'Se déclenche au paiement encaissé. Une commande créée à la main dans l’admin Shopify reste « en attente de paiement » : elle ne déclenchera pas ce message.',
}

export const TRIGGER_EVENTS: { value: TriggerEvent; label: string; description: string; group: string }[] = [
  // Commande
  { value: 'order_created', label: 'Commande créée', description: 'Dès qu’une commande est passée.', group: 'Commande' },
  { value: 'order_paid', label: 'Commande payée', description: 'Quand le paiement est confirmé.', group: 'Commande' },
  { value: 'order_fulfilled', label: 'Commande expédiée', description: 'Quand la commande est expédiée (suivi disponible).', group: 'Commande' },
  { value: 'order_delivered', label: 'Commande livrée', description: 'Quand le colis est livré au client.', group: 'Commande' },
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
 *  relances, panier abandonné) sert au marketing.
 *
 *  Les deux ensembles sont DISJOINTS : un déclencheur n'appartient qu'à un
 *  onglet, sinon on le propose là où il n'a rien à faire. */
const MARKETING_TRIGGERS = new Set<TriggerEvent>([
  'scheduled_date', 'customer_birthday',
  'contact_opted_in', 'optin_popup',
  'button_clicked', 'message_read', 'no_customer_reply',
  'checkout_abandoned',
])
// ⚠️ `checkout_abandoned` N'EST PAS ICI, volontairement.
//
// Il y figurait au motif que c'est « un déclencheur de commande ». Mais une
// relance de panier CHERCHE À VENDRE : c'est du marketing, et tout le reste du
// code le dit déjà — `use_case: 'cart'` est classé MARKETING chez Meta, et
// `kindForTrigger` l'exclut explicitement du transactionnel. Le seul effet de sa
// présence ici était de le proposer dans le mauvais onglet, où l'assistant
// finissait par construire une campagne déguisée en automatisation
// transactionnelle.
const TRANSACTIONAL_TRIGGERS = new Set<TriggerEvent>([
  'order_created', 'order_paid', 'order_fulfilled', 'order_delivered',
  'order_cancelled', 'refund_created', 'return_requested',
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
 */
const REPEATABLE_TRIGGERS = new Set<TriggerEvent>([
  'no_customer_reply', 'message_read', 'button_clicked',
  'contact_opted_in', 'optin_popup', 'checkout_abandoned',
])

/**
 * Récurrence par défaut, quand le graphe n'en porte pas.
 *
 * Le défaut général est 'once' : sûr par construction, aucune boucle possible
 * sans choix explicite.
 *
 * ⚠️ SAUF `checkout_abandoned`, où 'once' serait un CONTRESENS MÉTIER : un client
 * ne serait relancé que pour son PREMIER panier, jamais pour les suivants —
 * perte de ventes silencieuse, à l'opposé du but. Son occurrence (le token de
 * panier) le borne déjà correctement : une relance par panier. Le marchand peut
 * toujours choisir 'once' s'il ne veut relancer chaque client qu'une seule fois.
 */
export function defaultRecurrenceFor(trigger: TriggerEvent): 'once' | 'per_event' {
  return trigger === 'checkout_abandoned' ? 'per_event' : 'once'
}

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
  // Les deux ensembles sont disjoints : l'appartenance suffit à trancher.
  // (L'ancienne exception `!== 'checkout_abandoned'` compensait sa présence dans
  // les DEUX ensembles ; elle n'a plus lieu d'être et laisserait croire à un cas
  // particulier qui n'existe pas.)
  if (TRANSACTIONAL_TRIGGERS.has(trigger)) return 'transactional'
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
