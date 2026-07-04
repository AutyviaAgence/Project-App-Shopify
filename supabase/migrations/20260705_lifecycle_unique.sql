-- =====================================================================
--  MIGRATION — Unicité (conversation, étape) sur les étiquettes lifecycle
--  Date : 2026-07-05
--
--  Les conversations peuvent porter PLUSIEURS étapes (l'IA en pose 0 à 3).
--  Cet index unique garantit qu'une même étape n'est pas assignée deux fois
--  à la même conversation (le code dédup déjà, ceinture + bretelles).
--  On dédoublonne d'abord les éventuels doublons historiques.
-- =====================================================================

BEGIN;

-- Purge des doublons existants (garde la ligne la plus ancienne par paire).
DELETE FROM conversation_lifecycle_stages a
USING conversation_lifecycle_stages b
WHERE a.conversation_id = b.conversation_id
  AND a.stage_id = b.stage_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_lifecycle_unique
  ON conversation_lifecycle_stages (conversation_id, stage_id);

COMMIT;
