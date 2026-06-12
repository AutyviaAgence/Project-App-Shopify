-- =====================================================================
--  MIGRATION — Snapshot de l'en-tête média dans la version validée
--  Date : 2026-06-12
--
--  Le snapshot "version validée" mémorisait body/header/footer texte mais pas
--  le type d'en-tête ni le média. Conséquence : "revenir à la version validée"
--  ne supprimait pas une image/vidéo/doc ajoutée après. On capture désormais
--  header_type + header_media_url dans le snapshot.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS approved_header_type      TEXT,
  ADD COLUMN IF NOT EXISTS approved_header_media_url TEXT;

-- Initialise pour les templates déjà approuvés.
UPDATE whatsapp_templates
SET approved_header_type = header_type,
    approved_header_media_url = header_media_url
WHERE status = 'approved' AND approved_header_type IS NULL;

COMMIT;
