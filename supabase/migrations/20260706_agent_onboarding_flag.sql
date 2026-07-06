-- =====================================================================
--  MIGRATION — Indicateur d'onboarding agent effectué
--  Date : 2026-07-06
--
--  Permet de déclencher l'onboarding e-commerce pré-rempli UNE SEULE FOIS,
--  au 1er accès après connexion de la boutique. Passe à true quand le marchand
--  a confirmé/activé son agent.
-- =====================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agent_onboarding_done BOOLEAN NOT NULL DEFAULT false;

COMMIT;
