-- =====================================================================
--  MIGRATION — Triggers "une seule fois"
--  Date : 2026-06-12
--
--  Certains déclencheurs ne doivent s'exécuter qu'UNE fois (date précise).
--  On mémorise quand l'automatisation a été déclenchée pour ne plus la
--  ré-évaluer. (L'anniversaire/pas-de-réponse restent récurrents.)
-- =====================================================================

BEGIN;

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS triggered_once_at TIMESTAMPTZ;

COMMIT;
