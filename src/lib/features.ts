/**
 * Feature flags UI — points d'activation/désactivation côté interface.
 *
 * EMAIL_UI_ENABLED : l'app est centrée WhatsApp + Shopify. Le canal email est
 * pleinement codé (OAuth Gmail/SMTP, envoi, brouillons IA, inbox unifiée) mais
 * MASQUÉ du marchand par défaut. Mettre à `true` pour réexposer toute l'UI email
 * (carte de connexion, onglets/filtres canal, zone d'envoi email) sans rien
 * recoder. Le backend (/api/email/*) reste actif quel que soit le flag.
 */
export const EMAIL_UI_ENABLED = false
