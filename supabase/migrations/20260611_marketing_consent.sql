-- =====================================================================
--  MIGRATION — Consentement marketing WhatsApp
--  Date : 2026-06-11
--
--  Distingue le consentement transactionnel (suivi commande) du
--  consentement marketing (offres/promos), exigence Meta. Un contact
--  opted-in peut recevoir du transactionnel ; seul marketing_consent=true
--  autorise les campagnes marketing.
-- =====================================================================

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

COMMIT;
