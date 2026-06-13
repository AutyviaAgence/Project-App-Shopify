-- =====================================================================
--  MIGRATION — Retrait du catalogue Meta (Multi-Product Message)
--  Date : 2026-06-14
--
--  On abandonne le catalogue Meta (Commerce Manager) : le shopping en chat
--  et les fiches produit passeront par Shopify. La colonne waba_catalog_id
--  n'est plus utilisée nulle part dans le code.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_sessions
  DROP COLUMN IF EXISTS waba_catalog_id;

COMMIT;
