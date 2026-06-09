-- =====================================================================
--  MIGRATION — Retrait du système qualifier / type d'agent
--  Date : 2026-06-09
--
--  Contexte : tous les agents sont désormais uniformes (plus de type
--  qualifier/relance, plus de routes de redirection ni d'agent qualifier
--  assigné aux sessions). Le code a déjà été nettoyé.
--
--  Ce script :
--   1. Supprime la table qualifier_routes
--   2. Supprime la colonne whatsapp_sessions.qualifier_agent_id
--   3. Normalise ai_agents.agent_type à 'conversation' (colonne conservée,
--      toujours = 'conversation' ; on garde la colonne pour compat code)
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
--  ⚠️ À RELIRE puis exécuter avec :
--     psql "<conn>" -v ON_ERROR_STOP=1 -f 20260609_remove_qualifier.sql
-- =====================================================================

BEGIN;

-- 1. Table des routes de qualification
DROP TABLE IF EXISTS qualifier_routes CASCADE;

-- 2. Colonne d'assignation d'un agent qualifier à une session
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS qualifier_agent_id;

-- 3. Uniformiser le type d'agent (relance/qualifier → conversation)
UPDATE ai_agents SET agent_type = 'conversation'
WHERE agent_type IS DISTINCT FROM 'conversation';

COMMIT;

-- Vérifs (informatif) :
-- SELECT to_regclass('public.qualifier_routes');                       -- attendu : NULL
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='whatsapp_sessions' AND column_name='qualifier_agent_id'; -- attendu : 0 ligne
-- SELECT DISTINCT agent_type FROM ai_agents;                           -- attendu : 'conversation'
