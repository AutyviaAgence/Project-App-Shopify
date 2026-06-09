-- =====================================================================
--  MIGRATION — Billing Shopify (plans, charge, code de liaison)
--  Date : 2026-06-09
--
--  - shopify_stores : plan, statut d'abonnement, charge_id Shopify
--  - profiles.link_code : code de liaison direct <-> Shopify (réconciliation)
--
--  Plans : free | starter | growth | scale
--  billing_source (déjà existant) : direct | shopify
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

-- Abonnement côté boutique Shopify
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';            -- free|starter|growth|scale
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active'; -- active|pending|cancelled
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS shopify_charge_id TEXT;                       -- id de l'AppSubscription Shopify
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Code de liaison pour réconcilier un compte direct avec une install Shopify
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS link_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_link_code ON profiles(link_code) WHERE link_code IS NOT NULL;

COMMIT;
