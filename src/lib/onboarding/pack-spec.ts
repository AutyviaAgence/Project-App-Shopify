/**
 * Spécification du "pack" d'onboarding : 1 modèle + 1 automatisation par
 * trigger d'automatisation existant (source de vérité = TRIGGER_EVENTS).
 *
 * Pour chaque trigger on FIXE ici les variables ({{1}}..{{n}} = variable_keys,
 * vocabulaire résolu à l'envoi par le moteur d'automatisations) et un délai
 * par défaut. L'IA ne rédige QUE le texte (body/header/label) au ton de la
 * marque — jamais les variables — ce qui garantit des modèles envoyables.
 */

import type { TriggerEvent } from '@/lib/automations/types'
import type { UseCaseKey } from '@/lib/templates/use-cases'
import type { TemplateButton, TemplateCard } from '@/types/database'

export type PackTriggerSpec = {
  trigger: TriggerEvent
  /** nom stable du modèle créé (unicité par user via name|language) */
  templateName: string
  label: string
  /** Nom anglais — choisi à la génération selon la langue du marchand. */
  labelEn: string
  category: 'UTILITY' | 'MARKETING'
  use_case: UseCaseKey
  /** {{1}} = variable_keys[0], etc. — vocabulaire résolu par le moteur */
  variable_keys: string[]
  sample_values: string[]
  /** délai par défaut avant envoi (minutes) — éditable dans l'onboarding */
  default_delay_minutes: number
  /** corps de secours si l'IA échoue (déjà valide, variables comprises) */
  fallback_body: string
  /** indication de rédaction pour l'IA */
  intent: string
  /** Boutons du modèle (déterministes, jamais rédigés par l'IA). Les URL
   *  peuvent contenir le jeton `{store_url}`, remplacé à la génération par le
   *  domaine réel de la boutique. */
  buttons?: TemplateButton[]
}

export const PACK_SPECS: PackTriggerSpec[] = [
  {
    trigger: 'order_created', templateName: 'onb_commande_creee', label: 'Commande créée', labelEn: 'Order created',
    category: 'UTILITY', use_case: 'order_status',
    variable_keys: ['customer_first_name', 'order_number', 'order_total'],
    sample_values: ['Marie', '#1024', '49,90 €'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, votre commande {{2}} ({{3}}) est bien enregistrée. Merci pour votre confiance !',
    intent: 'Confirmer la commande juste après l’achat, rassurer, remercier.',
    // Premier message reçu par le client : ouvrir la porte au SAV tout de
    // suite (l'URL de commande est dynamique par commande, impossible en
    // bouton statique Meta, la réponse rapide est le choix pertinent).
    buttons: [{ type: 'QUICK_REPLY', text: 'J’ai une question' }],
  },
  {
    trigger: 'order_paid', templateName: 'onb_commande_payee', label: 'Commande payée', labelEn: 'Order paid',
    category: 'UTILITY', use_case: 'order_status',
    variable_keys: ['customer_first_name', 'order_number'],
    sample_values: ['Marie', '#1024'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, le paiement de votre commande {{2}} est confirmé. Nous la préparons !',
    intent: 'Confirmer la réception du paiement, annoncer la préparation.',
  },
  {
    trigger: 'order_fulfilled', templateName: 'onb_commande_expediee', label: 'Commande expédiée', labelEn: 'Order shipped',
    category: 'UTILITY', use_case: 'order_status',
    variable_keys: ['customer_first_name', 'order_number', 'tracking_url'],
    sample_values: ['Marie', '#1024', 'https://suivi.exemple.com/1024'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, votre commande {{2}} vient d’être expédiée. Suivez votre colis : {{3}}',
    intent: 'Annoncer l’expédition avec le lien de suivi.',
  },
  {
    trigger: 'order_delivered', templateName: 'onb_commande_livree', label: 'Commande livrée', labelEn: 'Order delivered',
    category: 'UTILITY', use_case: 'order_status',
    variable_keys: ['customer_first_name', 'order_number'],
    sample_values: ['Marie', '#1024'],
    default_delay_minutes: 60,
    fallback_body: 'Bonjour {{1}}, votre commande {{2}} a été livrée. Tout s’est bien passé ? Répondez-nous si besoin !',
    intent: 'Confirmer la livraison, ouvrir la porte au SAV et à l’avis.',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Tout est parfait 👍' },
      { type: 'QUICK_REPLY', text: 'J’ai un souci' },
    ],
  },
  {
    trigger: 'order_cancelled', templateName: 'onb_commande_annulee', label: 'Commande annulée', labelEn: 'Order cancelled',
    category: 'UTILITY', use_case: 'order_status',
    variable_keys: ['customer_first_name', 'order_number'],
    sample_values: ['Marie', '#1024'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, votre commande {{2}} a bien été annulée. Une question ? Répondez à ce message.',
    intent: 'Confirmer l’annulation avec empathie, proposer de l’aide.',
  },
  {
    trigger: 'refund_created', templateName: 'onb_remboursement', label: 'Remboursement émis', labelEn: 'Refund issued',
    category: 'UTILITY', use_case: 'billing',
    variable_keys: ['customer_first_name', 'order_number', 'order_total'],
    sample_values: ['Marie', '#1024', '49,90 €'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, le remboursement de votre commande {{2}} ({{3}}) a été émis. Il apparaîtra sous 3 à 5 jours ouvrés.',
    intent: 'Confirmer le remboursement et le délai bancaire.',
  },
  {
    trigger: 'return_requested', templateName: 'onb_demande_retour', label: 'Demande de retour', labelEn: 'Return request',
    category: 'UTILITY', use_case: 'support',
    variable_keys: ['customer_first_name', 'order_number'],
    sample_values: ['Marie', '#1024'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, nous avons bien reçu votre demande de retour pour la commande {{2}}. On s’en occupe et on revient vers vous rapidement.',
    intent: 'Accuser réception de la demande de retour, rassurer sur la prise en charge.',
  },
  {
    trigger: 'checkout_abandoned', templateName: 'onb_panier_abandonne', label: 'Panier abandonné', labelEn: 'Abandoned cart',
    category: 'MARKETING', use_case: 'cart',
    variable_keys: ['customer_first_name', 'cart_url'],
    sample_values: ['Marie', 'https://boutique.exemple.com/panier'],
    default_delay_minutes: 120,
    fallback_body: 'Bonjour {{1}}, votre panier vous attend toujours 🙂 Finalisez votre commande ici : {{2}}',
    intent: 'Relancer un panier non finalisé, ton léger, lien direct.',
  },
  {
    trigger: 'contact_opted_in', templateName: 'onb_bienvenue', label: 'Bienvenue (opt-in)', labelEn: 'Welcome (opt-in)',
    category: 'MARKETING', use_case: 'marketing',
    variable_keys: ['customer_first_name', 'store_name', 'store_url'],
    sample_values: ['Marie', 'Ma Boutique', 'https://boutique.exemple.com'],
    default_delay_minutes: 0,
    fallback_body: 'Bienvenue {{1}} ! Vous êtes maintenant connecté(e) à {{2}} sur WhatsApp. Découvrez la boutique : {{3}}',
    intent: 'Souhaiter la bienvenue à un nouvel abonné WhatsApp, présenter la marque.',
    buttons: [{ type: 'URL', text: 'Découvrir la boutique', url: '{store_url}' }],
  },
  {
    trigger: 'optin_popup', templateName: 'onb_bienvenue_popup', label: 'Bienvenue (popup site)', labelEn: 'Welcome (site popup)',
    category: 'MARKETING', use_case: 'marketing',
    variable_keys: ['customer_first_name', 'store_name', 'store_url'],
    sample_values: ['Marie', 'Ma Boutique', 'https://boutique.exemple.com'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, merci de nous avoir rejoints depuis {{2}} ! Besoin d’un conseil ? Répondez à ce message. La boutique : {{3}}',
    intent: 'Accueillir un visiteur qui a laissé son numéro via la popup du site.',
    buttons: [{ type: 'URL', text: 'Découvrir la boutique', url: '{store_url}' }],
  },
  {
    trigger: 'button_clicked', templateName: 'onb_clic_bouton', label: 'Clic sur un bouton', labelEn: 'Button clicked',
    category: 'UTILITY', use_case: 'support',
    variable_keys: ['customer_first_name', 'button_title'],
    sample_values: ['Marie', 'Suivre ma commande'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, vous avez choisi « {{2}} ». On s’en occupe tout de suite !',
    intent: 'Accuser réception du choix cliqué et enchaîner.',
  },
  {
    trigger: 'message_read', templateName: 'onb_relance_lecture', label: 'Relance après lecture', labelEn: 'Follow-up after read',
    category: 'MARKETING', use_case: 'marketing',
    variable_keys: ['customer_first_name'],
    sample_values: ['Marie'],
    default_delay_minutes: 60,
    fallback_body: 'Bonjour {{1}}, vous avez vu notre message 👀 Une question ? Nous sommes là pour vous aider.',
    intent: 'Relancer en douceur un client qui a lu sans répondre.',
  },
  {
    trigger: 'no_customer_reply', templateName: 'onb_relance_sans_reponse', label: 'Relance sans réponse', labelEn: 'Follow-up no reply',
    category: 'UTILITY', use_case: 'support',
    variable_keys: ['customer_first_name'],
    sample_values: ['Marie'],
    default_delay_minutes: 2880,
    fallback_body: 'Bonjour {{1}}, nous restons disponibles si vous avez besoin d’aide. Répondez à ce message quand vous voulez !',
    intent: 'Relance SAV bienveillante après silence prolongé.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Parler à un conseiller' }],
  },
  {
    trigger: 'scheduled_date', templateName: 'onb_campagne_planifiee', label: 'Campagne planifiée', labelEn: 'Scheduled campaign',
    category: 'MARKETING', use_case: 'marketing',
    variable_keys: ['customer_first_name', 'store_name', 'store_url'],
    sample_values: ['Marie', 'Ma Boutique', 'https://boutique.exemple.com'],
    default_delay_minutes: 0,
    fallback_body: 'Bonjour {{1}}, du nouveau chez {{2}} ! Venez découvrir : {{3}}',
    intent: 'Base réutilisable pour une annonce/campagne datée (nouveautés, offre).',
    buttons: [{ type: 'URL', text: 'Voir les nouveautés', url: '{store_url}' }],
  },
  {
    trigger: 'customer_birthday', templateName: 'onb_anniversaire', label: 'Anniversaire client', labelEn: 'Customer birthday',
    category: 'MARKETING', use_case: 'marketing',
    variable_keys: ['customer_first_name', 'store_name', 'store_url'],
    sample_values: ['Marie', 'Ma Boutique', 'https://boutique.exemple.com'],
    default_delay_minutes: 0,
    fallback_body: 'Joyeux anniversaire {{1}} 🎂 Toute l’équipe {{2}} vous souhaite une superbe journée ! Un petit plaisir ? {{3}}',
    intent: 'Souhaiter l’anniversaire, ton chaleureux, invitation douce.',
    buttons: [{ type: 'URL', text: 'Me faire plaisir', url: '{store_url}' }],
  },
]

/** Élément de pack généré (modèle personnalisé + config d'automatisation). */
export type PackItem = {
  trigger: TriggerEvent
  templateName: string
  label: string
  category: 'UTILITY' | 'MARKETING'
  use_case: UseCaseKey
  header_text: string | null
  body_text: string
  footer_text: string | null
  variable_keys: string[]
  sample_values: string[]
  delay_minutes: number
  automation_name: string
  description: string
  /** Boutons du modèle (URL résolues avec le vrai domaine de la boutique). */
  buttons: TemplateButton[] | null
  /** 'carousel' quand la boutique a assez de produits avec image : le modèle
   *  campagne devient un carrousel produits (cartes ci-dessous). */
  template_type?: 'standard' | 'carousel'
  /** Cartes du carrousel produits (image, nom · prix, bouton Voir). */
  carousel_cards?: TemplateCard[] | null
}

/** Version du FORMAT de pack. À incrémenter quand les items gagnent des
 *  champs (boutons, carrousel…) : les caches d'une version antérieure sont
 *  régénérés au lieu d'être resservis sans les nouveautés. */
export const PACK_VERSION = 3

export type OnboardingPack = {
  version?: number
  generated_at: string
  language: string
  items: PackItem[]
}

/** Valide un corps généré : tous les {{n}} présents doivent exister dans les clés. */
export function isValidBody(body: string, keysCount: number): boolean {
  if (!body || body.length < 15 || body.length > 900) return false
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10))
  return nums.every((n) => n >= 1 && n <= keysCount)
}
