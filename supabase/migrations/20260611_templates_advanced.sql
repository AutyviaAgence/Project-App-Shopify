-- =====================================================================
--  MIGRATION — Modèles WhatsApp avancés (header média + boutons)
--  Date : 2026-06-11
--
--  Ajoute le support des en-têtes média (Texte/Image/Vidéo/Document) et des
--  boutons (URL, téléphone, copier-code, réponse rapide) aux templates, comme
--  l'éditeur officiel WhatsApp.
--
--  header_type    : none | text | image | video | document
--  header_media_url : URL du média d'exemple (pour image/video/document)
--  buttons        : JSON, ex :
--    [{"type":"URL","text":"Voir","url":"https://..."},
--     {"type":"PHONE_NUMBER","text":"Appeler","phone":"+33..."},
--     {"type":"COPY_CODE","text":"Copier","code":"PROMO10"},
--     {"type":"QUICK_REPLY","text":"Oui"}]
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS header_type TEXT NOT NULL DEFAULT 'none'; -- none|text|image|video|document
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS header_media_url TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS buttons JSONB;

COMMIT;
