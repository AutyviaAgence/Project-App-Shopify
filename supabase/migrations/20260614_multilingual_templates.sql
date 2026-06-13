-- =====================================================================
--  MIGRATION — Templates multilingues
--  Date : 2026-06-14
--
--  Un modèle WhatsApp existe en plusieurs langues, chacune étant une ligne
--  séparée (user_id, name, language) — déjà permis par idx_wa_templates_name_lang.
--  Ces colonnes additives permettent de :
--    - savoir quelle langue le marchand a tapée (source) vs les traductions auto
--    - ne jamais écraser une traduction éditée à la main lors d'une re-traduction
--
--  source_language     : la langue d'origine (celle que le marchand a écrite).
--  is_auto_translated  : true sur les lignes générées par IA. Repasse à false
--                        dès qu'un humain édite la ligne (protège du re-écrasement).
--  auto_translated_at  : horodatage de la dernière génération IA (provenance).
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS source_language TEXT,
  ADD COLUMN IF NOT EXISTS is_auto_translated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_translated_at TIMESTAMPTZ;

COMMIT;
