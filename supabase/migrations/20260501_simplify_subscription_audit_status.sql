-- ============================================================
-- Migration : Simplification subscription_status + audit_status
-- Date : 2026-05-01
--
-- Changements :
--   1. Ajout colonnes manquantes : tokens_extra, pending_plan
--   2. Renommage valeurs subscription_status :
--        trial      → trialing
--        expired    → past_due
--        cancelled  → canceled   (un seul L, cohérence Stripe)
--   3. Remplacement onboarding_status par audit_status :
--        pending    → none         (pas d'audit)
--        onboarding → acompte_paid (acompte 750€ payé)
--        active     → none         (client autonome sans audit actif)
--        skipped    → none         (n'avait pas fait l'audit)
--        observer   → none         (cas edge, pas d'audit non plus)
--   4. Migration des utilisateurs existants
-- ============================================================


-- ─── 1. Supprimer l'ancien CHECK avant de modifier les valeurs ───────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;


-- ─── 2. Migration subscription_status des utilisateurs existants ──────────────

UPDATE public.profiles SET subscription_status = 'trialing' WHERE subscription_status = 'trial';
UPDATE public.profiles SET subscription_status = 'past_due'  WHERE subscription_status = 'expired';
UPDATE public.profiles SET subscription_status = 'canceled'  WHERE subscription_status = 'cancelled';


-- ─── 3. Colonnes manquantes ───────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tokens_extra bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_plan text CHECK (pending_plan IS NULL OR pending_plan IN ('starter', 'pro', 'scale'));


-- ─── 4. Ajout colonne audit_status ───────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS audit_status text NOT NULL DEFAULT 'none'
    CHECK (audit_status IN ('none', 'acompte_paid', 'solde_paid', 'refunded'));


-- ─── 5. Migration onboarding_status → audit_status pour les existants ─────────

UPDATE public.profiles SET audit_status = 'acompte_paid' WHERE onboarding_status = 'onboarding';


-- ─── 6. Nouveau CHECK subscription_status ────────────────────────────────────

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
    CHECK (subscription_status IS NULL OR subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'none'));


-- ─── 7. Default et suppression onboarding_status ─────────────────────────────

ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'none';
ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_status;
