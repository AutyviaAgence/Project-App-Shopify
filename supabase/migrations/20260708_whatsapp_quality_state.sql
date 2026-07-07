-- =====================================================================
--  MIGRATION — État de santé WhatsApp par session (qualité + palier)
--  Date : 2026-07-08
--
--  Surveillance permanente des numéros : les webhooks Meta
--  (phone_number_quality_update / message_template_status_update) et le cron
--  de secours écrivent ici. Le dashboard lit cet état (pas d'appel Meta à
--  chaque affichage). `sends_paused` coupe AUTOMATIQUEMENT le marketing quand
--  la qualité passe au ROUGE (le SAV et l'utility continuent).
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS quality_rating TEXT,          -- GREEN | YELLOW | RED
  ADD COLUMN IF NOT EXISTS messaging_limit_tier TEXT,    -- TIER_250 | TIER_2K | ...
  ADD COLUMN IF NOT EXISTS quality_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_paused BOOLEAN NOT NULL DEFAULT false;

COMMIT;
