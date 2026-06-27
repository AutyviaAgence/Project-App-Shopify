/**
 * Bibliothèque de modèles WhatsApp e-commerce par défaut.
 *
 * Modèles "prêts à l'emploi" que le marchand peut soumettre à Meta en 1 clic.
 * Conçus pour maximiser l'approbation : catégories correctes (UTILITY pour le
 * transactionnel, MARKETING pour le promotionnel), wording sobre, variables
 * numérotées {{1}}, {{2}}…
 *
 * À l'usage : on crée une copie locale (whatsapp_templates) pour le marchand,
 * puis il la soumet à SON compte Meta (chaque WABA a sa propre bibliothèque).
 */

import type { UseCaseKey } from '@/lib/templates/use-cases'

export type DefaultTemplate = {
  /** clé stable pour éviter les doublons à la création */
  key: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  /** catégorie e-commerce (pour la galerie + le classement) */
  use_case: UseCaseKey
  header_text?: string
  body_text: string
  footer_text?: string
  sample_values: string[]
  /** Clés des variables nommées, ordre = numéro ({{1}} = variable_keys[0]).
      Indispensable pour que l'envoi résolve les variables (sinon Meta 131008). */
  variable_keys: string[]
  /** libellé lisible pour l'UI */
  label: string
  description: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'order_confirmation',
    use_case: 'order_status',
    name: 'confirmation_commande',
    language: 'fr',
    category: 'UTILITY',
    label: 'Confirmation de commande',
    description: 'Envoyé juste après une commande pour la confirmer.',
    header_text: 'Commande confirmée',
    body_text: 'Bonjour {{1}}, votre commande {{2}} est bien confirmée. Merci pour votre confiance !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
    variable_keys: ['customer_first_name', 'order_number'],
  },
  {
    key: 'order_shipped',
    use_case: 'order_status',
    name: 'commande_expediee',
    language: 'fr',
    category: 'UTILITY',
    label: 'Commande expédiée',
    description: 'Notifie le client que son colis est parti, avec lien de suivi.',
    header_text: 'Votre colis est en route',
    body_text: 'Bonjour {{1}}, votre commande {{2}} vient d\'être expédiée. Suivez votre colis ici : {{3}} — merci pour votre confiance !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024', 'https://suivi.exemple.com/1024'],
    variable_keys: ['customer_first_name', 'order_number', 'tracking_url'],
  },
  {
    key: 'order_delivered',
    use_case: 'order_status',
    name: 'commande_livree',
    language: 'fr',
    category: 'UTILITY',
    label: 'Commande livrée',
    description: 'Confirme la livraison et invite à donner un avis.',
    body_text: 'Bonjour {{1}}, votre commande {{2}} a été livrée. Tout s\'est bien passé ? N\'hésitez pas à nous écrire si besoin !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
    variable_keys: ['customer_first_name', 'order_number'],
  },
  {
    key: 'order_cancelled',
    use_case: 'order_status',
    name: 'commande_annulee',
    language: 'fr',
    category: 'UTILITY',
    label: 'Commande annulée',
    description: 'Confirme l\'annulation d\'une commande.',
    body_text: 'Bonjour {{1}}, votre commande {{2}} a bien été annulée. Si vous avez la moindre question, répondez à ce message, nous sommes là pour vous aider.',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
    variable_keys: ['customer_first_name', 'order_number'],
  },
  {
    key: 'refund_created',
    use_case: 'billing',
    name: 'remboursement_effectue',
    language: 'fr',
    category: 'UTILITY',
    label: 'Remboursement effectué',
    description: 'Informe le client qu\'un remboursement a été émis.',
    body_text: 'Bonjour {{1}}, votre remboursement pour la commande {{2}} a été effectué. Le montant sera crédité sur votre moyen de paiement sous quelques jours. Merci de votre confiance !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
    variable_keys: ['customer_first_name', 'order_number'],
  },
  {
    key: 'welcome_optin',
    use_case: 'support',
    name: 'message_bienvenue',
    language: 'fr',
    category: 'MARKETING',
    label: 'Message de bienvenue (opt-in)',
    description: 'Souhaite la bienvenue à un client qui vient de s\'abonner sur WhatsApp.',
    body_text: 'Bonjour {{1}}, merci de vous être abonné(e) ! Vous recevrez ici le suivi de vos commandes et nos meilleures offres. Une question ? Répondez simplement à ce message.',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie'],
    variable_keys: ['customer_first_name'],
  },
  {
    key: 'abandoned_cart',
    use_case: 'cart',
    name: 'panier_abandonne',
    language: 'fr',
    category: 'MARKETING',
    label: 'Panier abandonné',
    description: 'Relance un client qui a laissé des articles dans son panier.',
    body_text: 'Bonjour {{1}}, vous avez laissé des articles dans votre panier. Ils vous attendent toujours ! Finalisez votre commande ici : {{2}} — à très vite !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'https://boutique.exemple.com/panier'],
    variable_keys: ['customer_first_name', 'cart_url'],
  },
  {
    key: 'review_request',
    use_case: 'support',
    name: 'demande_avis',
    language: 'fr',
    category: 'MARKETING',
    label: 'Demande d\'avis',
    description: 'Demande un avis quelques jours après la livraison.',
    body_text: 'Bonjour {{1}}, avez-vous apprécié votre commande ? Votre avis compte beaucoup pour nous : {{2}}. Merci d\'avance pour votre retour !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'https://avis.exemple.com'],
    variable_keys: ['customer_first_name', 'review_url'],
  },
  {
    key: 'birthday',
    use_case: 'marketing',
    name: 'anniversaire_client',
    language: 'fr',
    category: 'MARKETING',
    label: 'Anniversaire client',
    description: 'Souhaite l\'anniversaire au client avec un code promo cadeau.',
    body_text: 'Joyeux anniversaire {{1}} ! 🎉 Pour fêter ça, voici un cadeau de la part de {{2}} : utilisez le code {{3}} pour profiter d\'une offre spéciale. À très vite !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'Ma Boutique', 'ANNIV10'],
    variable_keys: ['customer_first_name', 'store_name', 'promo_code'],
  },
  {
    key: 'promotion',
    use_case: 'marketing',
    name: 'offre_promo',
    language: 'fr',
    category: 'MARKETING',
    label: 'Promotion / Offre',
    description: 'Annonce une offre promotionnelle avec un code et un lien boutique.',
    body_text: 'Bonjour {{1}}, offre exclusive chez {{2}} ! Profitez-en avec le code {{3}}. Découvrez nos nouveautés ici : {{4}}. Offre à durée limitée !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'Ma Boutique', 'PROMO10', 'https://boutique.exemple.com'],
    variable_keys: ['customer_first_name', 'store_name', 'promo_code', 'store_url'],
  },
  {
    key: 'return_received',
    use_case: 'support',
    name: 'retour_recu',
    language: 'fr',
    category: 'UTILITY',
    label: 'Retour reçu',
    description: 'Confirme la réception d\'un retour / SAV.',
    body_text: 'Bonjour {{1}}, nous avons bien reçu votre demande de retour pour la commande {{2}}. Un conseiller revient vers vous sous 24h.',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
    variable_keys: ['customer_first_name', 'order_number'],
  },
]
