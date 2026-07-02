-- =====================================================================
--  MIGRATION — Ajoute la latence (ms) par appel IA à ai_usage_log
--  Date : 2026-07-02
--
--  Sert à estimer le VRAI plafond de débit en messages : le temps de
--  traitement d'un appel SAV (surtout l'appel OpenAI) est le facteur
--  limitant sous charge. Avec la latence par appel, on calcule combien de
--  messages/min le VPS peut absorber avant empilement.
-- =====================================================================

BEGIN;

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

COMMIT;
