-- =====================================================================
--  MIGRATION — Opt-in / consentement WhatsApp sur les contacts
--  Date : 2026-06-09
--
--  Meta exige un consentement explicite (opt-in) avant tout message
--  proactif (template). On trace le statut, la source et la date par contact.
--
--  Statuts :
--    none       — pas de consentement connu (défaut)
--    subscribed — le contact a consenti (a écrit en premier, case Shopify, etc.)
--    opted_out  — le contact s'est désinscrit (STOP)
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_in_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_in_source TEXT;       -- 'inbound_message' | 'shopify_checkout' | 'wa_link' | 'import' | 'manual'
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_in_at      TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_out_at     TIMESTAMPTZ;

-- Opt-in implicite rétroactif : tout contact ayant déjà envoyé un message entrant
-- a, de fait, initié le contact → consentement implicite (source 'inbound_message').
UPDATE contacts c
SET opt_in_status = 'subscribed',
    opt_in_source = 'inbound_message',
    opt_in_at = sub.first_inbound
FROM (
  SELECT conv.contact_id, MIN(m.created_at) AS first_inbound
  FROM messages m
  JOIN conversations conv ON conv.id = m.conversation_id
  WHERE m.direction = 'inbound'
  GROUP BY conv.contact_id
) sub
WHERE c.id = sub.contact_id
  AND c.opt_in_status = 'none';

CREATE INDEX IF NOT EXISTS idx_contacts_opt_in_status ON contacts(opt_in_status);

COMMIT;
