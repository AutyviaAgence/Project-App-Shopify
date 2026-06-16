-- =====================================================================
--  MIGRATION — Médias envoyables par l'agent (image / vidéo / document)
--  Date : 2026-06-16
--
--  La table knowledge_images stocke les médias que l'agent IA peut ENVOYER au
--  client pendant le SAV (via balises [IMAGE:ref] / [VIDEO:ref] / [DOC:ref]).
--  On ajoute media_kind pour distinguer les types ; les lignes existantes
--  restent des images.
-- =====================================================================

BEGIN;

ALTER TABLE knowledge_images
  ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'image';

CREATE INDEX IF NOT EXISTS idx_knowledge_images_user_kind
  ON knowledge_images (user_id, media_kind);

COMMIT;
