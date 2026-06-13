-- =====================================================================
--  MIGRATION — Langue préférée du contact
--  Date : 2026-06-13
--
--  Pour envoyer les templates WhatsApp dans la langue naturelle du client, on
--  mémorise sa langue préférée. Source par ordre de fiabilité :
--    1. Shopify customer.locale (langue choisie par le client sur la boutique)
--    2. pays → langue (fallback)
--    3. langue détectée dans la conversation WhatsApp
--
--  preferred_language : code langue ISO court (ex: 'fr', 'en', 'es', 'de').
--  language_source : d'où vient l'info (shopify | country | conversation | manual).
-- =====================================================================

BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS preferred_language TEXT,
  ADD COLUMN IF NOT EXISTS language_source TEXT;

COMMIT;
