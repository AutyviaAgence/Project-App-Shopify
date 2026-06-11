-- =====================================================================
--  MIGRATION — Snapshot du dernier contenu APPROUVÉ d'un template
--  Date : 2026-06-12
--
--  Permet de "revenir à l'ancien message validé" après une modification :
--  on mémorise le contenu du template au moment où Meta l'approuve, pour
--  pouvoir le restaurer si la nouvelle version est refusée (ou par choix).
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS approved_body_text   TEXT,
  ADD COLUMN IF NOT EXISTS approved_header_text TEXT,
  ADD COLUMN IF NOT EXISTS approved_footer_text TEXT,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ;

-- Initialise le snapshot pour les templates déjà approuvés (contenu actuel).
UPDATE whatsapp_templates
SET approved_body_text = body_text,
    approved_header_text = header_text,
    approved_footer_text = footer_text,
    approved_at = COALESCE(updated_at, created_at)
WHERE status = 'approved' AND approved_body_text IS NULL;

COMMIT;
