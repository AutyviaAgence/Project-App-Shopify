-- =====================================================================
--  MIGRATION — Plafond de messages IA par conversation (défaut 10)
--  Date : 2026-07-06
--
--  max_messages_per_conversation existait mais n'était jamais appliqué et
--  restait NULL. On lui donne une valeur par défaut (10) pour que le plafond
--  soft (notif « conversation longue ») fonctionne, et on renseigne les agents
--  existants qui n'avaient pas de valeur.
-- =====================================================================

BEGIN;

ALTER TABLE ai_agents
  ALTER COLUMN max_messages_per_conversation SET DEFAULT 10;

UPDATE ai_agents
  SET max_messages_per_conversation = 10
  WHERE max_messages_per_conversation IS NULL;

COMMIT;
