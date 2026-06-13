-- =====================================================================
--  MIGRATION — Agent IA "référent" (par défaut) du compte
--  Date : 2026-06-13
--
--  Un agent peut être marqué "référent" : il est assigné automatiquement à
--  toutes les NOUVELLES conversations qui n'ont pas d'agent spécifique, et
--  active l'IA dessus. Au plus UN agent référent par utilisateur (index unique
--  partiel).
-- =====================================================================

BEGIN;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Au plus un agent référent par utilisateur.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_one_default
  ON ai_agents(user_id) WHERE is_default = true;

COMMIT;
