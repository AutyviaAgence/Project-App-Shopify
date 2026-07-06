-- =====================================================================
--  MIGRATION — Lien contact ↔ client Shopify
--  Date : 2026-07-06
--
--  Relie un contact WhatsApp à un client Shopify (customer_id GraphQL, gid).
--  Sert à retrouver les commandes de FAÇON FIABLE (par customer_id) au lieu de
--  la recherche approximative par email/téléphone qui pouvait remonter les
--  commandes d'autres clients. Rempli à l'opt-in (Cas 3) ou quand l'agent
--  identifie le client par email (Cas 2 SAV).
-- =====================================================================

BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT;

-- Recherche rapide des contacts déjà reliés.
CREATE INDEX IF NOT EXISTS idx_contacts_shopify_customer
  ON contacts (shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

COMMIT;
