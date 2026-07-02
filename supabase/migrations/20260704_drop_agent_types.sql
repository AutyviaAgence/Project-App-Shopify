-- =====================================================================
--  MIGRATION — Retire les agent_type 'relance' et 'qualifier'
--  Date : 2026-07-04
--
--  Ne garde que 'conversation'. 'qualifier' était déjà retiré (feature
--  supprimée) ; 'relance' était un vestige legacy des campagnes (les campagnes
--  utilisent désormais des templates Meta approuvés, plus un agent IA).
--
--  Vérifié avant migration : 8 agents en base, tous déjà 'conversation' ;
--  1 seule campagne (draft « La Mifff ») avec un relance_agent_id → nettoyée.
-- =====================================================================

BEGIN;

-- 1. Nettoyer les vestiges de relance_agent_id sur les campagnes puis dropper.
UPDATE campaigns SET relance_agent_id = NULL WHERE relance_agent_id IS NOT NULL;
ALTER TABLE campaigns DROP COLUMN IF EXISTS relance_agent_id;

-- 2. Normaliser les agents (déjà tous 'conversation' — ceinture + bretelles).
UPDATE ai_agents SET agent_type = 'conversation' WHERE agent_type <> 'conversation';

-- 3. Resserrer la contrainte CHECK sur la seule valeur autorisée.
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_agent_type_check;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_agent_type_check
  CHECK (agent_type = 'conversation');

COMMIT;
