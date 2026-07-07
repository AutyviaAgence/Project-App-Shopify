-- =====================================================================
--  MIGRATION — Grand onboarding bloquant (connexions → pack → abonnement)
--  Date : 2026-07-08
--
--  - onboarding_completed_at : null = l'onboarding doit être fait (gate).
--  - onboarding_step : reprise à la bonne étape si le marchand quitte.
--  - onboarding_pack : cache serveur du pack généré par l'IA (agent + 15
--    modèles + 15 automatisations proposés) — évite toute re-génération.
--  Les comptes EXISTANTS sont "grandfathered" (marqués terminés).
-- =====================================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_pack JSONB;

-- Les comptes déjà créés ne repassent pas par l'onboarding forcé.
UPDATE profiles SET onboarding_completed_at = NOW() WHERE onboarding_completed_at IS NULL;

COMMIT;
