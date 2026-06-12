-- =====================================================================
--  MIGRATION — Templates de type CAROUSEL (carrousel produit)
--  Date : 2026-06-13
--
--  Un template WhatsApp peut être un carrousel : un message d'introduction
--  (body principal, avec variables {{n}}) suivi de 1 à 10 CARTES défilables.
--  Chaque carte = un média (image/vidéo) + un texte + 1 à 2 boutons.
--
--  template_type : 'standard' (par défaut, comportement actuel) | 'carousel'
--  carousel_cards : tableau JSON des cartes. Format d'une carte :
--    {
--      "header_type": "image" | "video",
--      "header_media_url": "<storage_path|url>",   -- média d'exemple
--      "body_text": "Nettoyant purifiant…",
--      "buttons": [ { "type": "URL"|"QUICK_REPLY", "text": "...", "url"?: "..." } ]
--    }
--  approved_carousel_cards : snapshot des cartes validées par Meta (comme les
--  autres champs approved_*), pour pouvoir revenir à la dernière version validée.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS carousel_cards JSONB,
  ADD COLUMN IF NOT EXISTS approved_carousel_cards JSONB;

COMMIT;
