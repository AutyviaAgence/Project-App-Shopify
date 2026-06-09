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

export type DefaultTemplate = {
  /** clé stable pour éviter les doublons à la création */
  key: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  header_text?: string
  body_text: string
  footer_text?: string
  sample_values: string[]
  /** libellé lisible pour l'UI */
  label: string
  description: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'order_confirmation',
    name: 'confirmation_commande',
    language: 'fr',
    category: 'UTILITY',
    label: 'Confirmation de commande',
    description: 'Envoyé juste après une commande pour la confirmer.',
    header_text: 'Commande confirmée',
    body_text: 'Bonjour {{1}}, votre commande {{2}} est bien confirmée. Merci pour votre confiance !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
  },
  {
    key: 'order_shipped',
    name: 'commande_expediee',
    language: 'fr',
    category: 'UTILITY',
    label: 'Commande expédiée',
    description: 'Notifie le client que son colis est parti, avec lien de suivi.',
    header_text: 'Votre colis est en route',
    body_text: 'Bonjour {{1}}, votre commande {{2}} vient d\'être expédiée. Suivez votre colis ici : {{3}}',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024', 'https://suivi.exemple.com/1024'],
  },
  {
    key: 'order_delivered',
    name: 'commande_livree',
    language: 'fr',
    category: 'UTILITY',
    label: 'Commande livrée',
    description: 'Confirme la livraison et invite à donner un avis.',
    body_text: 'Bonjour {{1}}, votre commande {{2}} a été livrée. Tout s\'est bien passé ? N\'hésitez pas à nous écrire si besoin !',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
  },
  {
    key: 'abandoned_cart',
    name: 'panier_abandonne',
    language: 'fr',
    category: 'MARKETING',
    label: 'Panier abandonné',
    description: 'Relance un client qui a laissé des articles dans son panier.',
    body_text: 'Bonjour {{1}}, vous avez laissé des articles dans votre panier. Ils vous attendent toujours ! Finalisez votre commande ici : {{2}}',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'https://boutique.exemple.com/panier'],
  },
  {
    key: 'review_request',
    name: 'demande_avis',
    language: 'fr',
    category: 'MARKETING',
    label: 'Demande d\'avis',
    description: 'Demande un avis quelques jours après la livraison.',
    body_text: 'Bonjour {{1}}, avez-vous apprécié votre commande ? Votre avis compte beaucoup pour nous : {{2}}',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', 'https://avis.exemple.com'],
  },
  {
    key: 'return_received',
    name: 'retour_recu',
    language: 'fr',
    category: 'UTILITY',
    label: 'Retour reçu',
    description: 'Confirme la réception d\'un retour / SAV.',
    body_text: 'Bonjour {{1}}, nous avons bien reçu votre demande de retour pour la commande {{2}}. Un conseiller revient vers vous sous 24h.',
    footer_text: 'Répondez STOP pour vous désinscrire',
    sample_values: ['Marie', '#1024'],
  },
]
