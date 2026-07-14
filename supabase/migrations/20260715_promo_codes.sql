-- =====================================================================
--  CODES PROMO XEYO — enfin versionnés, et enfin LUS
--  2026-07-15
--
--  ── L'ÉTAT DES LIEUX ────────────────────────────────────────────────
--
--  `promo_codes` existait en production (créée à la main, jamais dans une
--  migration : la base n'était donc pas reproductible). L'admin pouvait y créer
--  des codes… qui n'étaient JAMAIS lus.
--
--  La route de paiement attendait un `promo_code` dans son corps de requête,
--  mais aucun appelant ne l'envoyait — tout le bloc de résolution était du code
--  mort. En pratique, seul le champ « code promo » de l'interface Stripe
--  fonctionnait, et cette table ne servait à rien.
--
--  ── CE QUI CHANGE ───────────────────────────────────────────────────
--
--  Le code promo est désormais résolu côté serveur et traduit en `discount`
--  natif de la Billing API Shopify (remise en % ou en montant fixe, sur N
--  cycles). Plus aucun Stripe.
--
--  Les colonnes `stripe_*` sont CONSERVÉES pour l'instant : l'ancienne route
--  d'admin les écrit encore. Elles seront supprimées avec Stripe.
-- =====================================================================

BEGIN;

-- La table peut déjà exister (créée à la main en prod) : on la rend simplement
-- reproductible depuis zéro.
CREATE TABLE IF NOT EXISTS promo_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL,
  discount_percent NUMERIC,
  max_redemptions  INTEGER,
  applies_to       TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Ce qu'il faut pour la Billing API ────────────────────────────────

-- Remise en montant fixe (alternative au pourcentage).
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER;

-- Durée de la remise, en cycles de facturation → `durationLimitInIntervals`.
-- NULL = remise permanente. Ex. « -50 % pendant 3 mois » → 3.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS duration_months INTEGER;

-- Jours d'essai offerts → `trialDays`. Cumulable avec la remise : on peut offrir
-- 30 jours gratuits PUIS 3 mois à -50 %.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS trial_days INTEGER;

-- Compteur d'utilisations (l'ancienne `max_redemptions` n'était vérifiée que par
-- Stripe, jamais par nous → un code pouvait être réutilisé sans limite).
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS redemptions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Restreindre le code à certains plans. NULL = tous.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS plans TEXT[];

-- Un code est unique quelle que soit la casse (le marchand tape « bonjour »).
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (upper(code));


-- ── Qui a utilisé quel code ──────────────────────────────────────────
--
-- Sans cette table, rien n'empêchait un marchand de réutiliser indéfiniment le
-- même code promo à chaque changement d'abonnement.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id     UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shopify_charge_id TEXT,
  redeemed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un marchand n'utilise un code qu'une seule fois. C'est la base qui
  -- l'applique, pas le code applicatif.
  UNIQUE (promo_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions (user_id);


-- ── Le bug de dégradation de plan (CONSTATÉ EN PRODUCTION) ───────────
--
-- La route d'abonnement écrit `plan = <le plan payant visé>` AVANT que le
-- marchand ait approuvé, avec `subscription_status = 'pending'`. Or le contrôle
-- de quota retombe en `free` dès que le statut n'est pas `active`.
--
-- Conséquence, vérifiée dans la base de prod (plan='pro', status='pending') :
-- un marchand qui lance un changement de plan et n'approuve pas TOUT DE SUITE
-- se retrouve bridé en gratuit — alors qu'il a un abonnement payant en cours.
--
-- Le plan visé va désormais ici, et `plan` n'est modifié qu'une fois le paiement
-- CONFIRMÉ par Shopify.
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS pending_plan TEXT;

COMMENT ON COLUMN shopify_stores.pending_plan IS
  'Plan en attente d''approbation Shopify. `plan` ne change qu''au callback confirmé, sinon le marchand est dégradé en free pendant l''approbation.';


-- RLS : ces tables sont purement administratives (résolution côté serveur).
-- Aucune policy = aucun accès client. Le service_role contourne la RLS.
ALTER TABLE promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
