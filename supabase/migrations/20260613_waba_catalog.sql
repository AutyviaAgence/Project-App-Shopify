-- =====================================================================
--  MIGRATION — Catalogue Meta (Multi-Product Message) sur la session WABA
--  Date : 2026-06-13
--
--  Pour envoyer des messages produit / multi-produit (shopping in chat), il
--  faut référencer un catalogue Meta lié au compte WhatsApp Business.
--
--  waba_catalog_id : ID du catalogue Meta (Commerce Manager) à utiliser pour
--    les messages produit. Renseigné par le marchand dans les réglages.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS waba_catalog_id TEXT;

COMMIT;
