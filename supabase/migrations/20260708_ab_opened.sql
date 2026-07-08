-- =====================================================================
--  MIGRATION — Taux d'OUVERTURE des tests A/B + entonnoir d'engagement
--  Date : 2026-07-08
--
--  On ajoute le suivi de l'ouverture (double-coche bleue WhatsApp) aux
--  assignations A/B. L'entonnoir stats devient : envoyés → ouverts →
--  répondus → ventes. Rempli à partir des statuts `read` reçus de Meta.
-- =====================================================================

BEGIN;

ALTER TABLE ab_test_assignments
  ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

COMMIT;
