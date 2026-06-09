-- =====================================================================
--  MIGRATION — Canal préféré du contact (notifications transactionnelles)
--  Date : 2026-06-09
--
--  preferred_channel : sur quel canal le contact veut recevoir les
--  notifications proactives (commande expédiée, etc.).
--    none     → pas d'opt-in notif (défaut)
--    whatsapp → notifs par WhatsApp
--    email    → notifs par email
--    both     → les deux
--
--  L'opt-in conversationnel (subscribed/opted_out) existe déjà via opt_in_status.
--  Ici on ajoute le CANAL choisi pour les notifs transactionnelles.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_channel TEXT NOT NULL DEFAULT 'none'; -- none|whatsapp|email|both
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notify_email TEXT;          -- email fourni pour les notifs (si différent)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_optin_at TIMESTAMPTZ;

COMMIT;
