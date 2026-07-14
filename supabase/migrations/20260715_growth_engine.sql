-- =====================================================================
--  MOTEUR DE CROISSANCE UNIFIÉ — parrainage + affiliation
--  2026-07-15
--
--  ── POURQUOI CETTE TABLE UNIQUE ─────────────────────────────────────
--
--  Il y avait DEUX systèmes concurrents, et aucun ne fonctionnait :
--
--   · L'affiliation était rompue au premier maillon. Le lien /r/{code}
--     posait un cookie `referral_code`, mais la page d'abonnement lisait
--     `affiliate_code` — que RIEN ne posait. La fonction qui calcule les
--     commissions n'a donc JAMAIS tourné en production. Pire : un code
--     affilié atterrissait dans le système de parrainage, où il ne
--     correspondait à rien. Le partenaire perdait sa commission ET
--     personne ne gagnait quoi que ce soit.
--
--   · Le parrainage reposait sur un trigger qui n'existait que dans un
--     vieux dump de sauvegarde, dans aucune migration.
--
--  D'où : UN code, UNE attribution, UNE récompense. Deux natures de
--  porteur (`kind`), et c'est tout.
--
--  ── LE PRINCIPE ─────────────────────────────────────────────────────
--
--   1. growth_codes        — qui porte un lien (un parrain OU un affilié)
--   2. growth_attributions — posée à l'INSCRIPTION du filleul
--   3. growth_rewards      — versée au PREMIER PAIEMENT confirmé
--
--  L'idempotence est portée par le SCHÉMA, pas par le code applicatif :
--  un callback de facturation rejoué ne peut pas doubler une récompense,
--  la base la refuse.
-- =====================================================================

BEGIN;

-- ── 1. Les porteurs de lien ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_codes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- La nature du porteur détermine la récompense :
  --   'referral'  → un marchand Xeyo   → 1 mois d'abonnement offert
  --   'affiliate' → un partenaire      → une commission en argent
  kind               TEXT NOT NULL CHECK (kind IN ('referral','affiliate')),

  -- ⚠️ NULLABLE — et c'est délibéré.
  -- L'ancienne table `affiliate_codes` avait `user_id NOT NULL`, mais la route
  -- d'admin ne le renseignait JAMAIS (elle n'insérait que label/code/commission).
  -- Résultat : soit l'insert échouait, soit le partenaire n'était rattaché à
  -- rien et ne voyait jamais ses commissions. Ici, un code affilié peut être
  -- créé AVANT que le partenaire n'ait un compte (on garde son email), et il
  -- sera rattaché à son inscription.
  owner_user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  label              TEXT,
  contact_email      TEXT,

  code               TEXT NOT NULL,

  -- Affilié : % du premier paiement. NULL pour un parrain.
  commission_percent NUMERIC CHECK (
    commission_percent IS NULL
    OR (commission_percent > 0 AND commission_percent <= 100)
  ),

  -- Parrain : mois d'abonnement offerts.
  reward_months      INTEGER NOT NULL DEFAULT 1
                       CHECK (reward_months >= 0 AND reward_months <= 12),

  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un parrain est forcément un compte Xeyo ; un affilié doit avoir un taux.
  CONSTRAINT growth_codes_referral_needs_owner
    CHECK (kind <> 'referral' OR owner_user_id IS NOT NULL),
  CONSTRAINT growth_codes_affiliate_needs_commission
    CHECK (kind <> 'affiliate' OR commission_percent IS NOT NULL)
);

-- Un code est unique quelle que soit la casse : /r/abc et /r/ABC sont le même
-- lien. Sans ça, deux porteurs pourraient revendiquer le même code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_codes_code
  ON growth_codes (upper(code));

-- Un marchand n'a qu'UN seul code de parrainage (mais peut aussi porter un code
-- affilié — d'où l'index partiel).
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_codes_referral_owner
  ON growth_codes (owner_user_id) WHERE kind = 'referral';

CREATE INDEX IF NOT EXISTS idx_growth_codes_owner ON growth_codes (owner_user_id);


-- ── 2. L'attribution — posée à l'INSCRIPTION, pas au paiement ────────
--
-- C'est le point qui répare l'affiliation : le lien entre le filleul et son
-- porteur est enregistré dès la création du compte (par `handle_new_user`, qui
-- lit le code dans les métadonnées d'inscription). Le paiement, lui, ne fait
-- que DÉCLENCHER la récompense — il ne détermine plus qui a amené qui.
CREATE TABLE IF NOT EXISTS growth_attributions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id        UUID NOT NULL REFERENCES growth_codes(id) ON DELETE CASCADE,

  -- UNIQUE : un marchand n'est attribué qu'une fois, à vie. Il ne peut pas
  -- « changer de parrain » en se réinscrivant via un autre lien.
  referee_id     UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  attributed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Renseigné au premier paiement Shopify confirmé (billing/callback).
  converted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_growth_attr_code ON growth_attributions (code_id);


-- ── 3. Les récompenses versées ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id      UUID NOT NULL REFERENCES growth_attributions(id) ON DELETE CASCADE,

  beneficiary_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- 'referrer' = celui qui a amené. 'referee' = celui qui a été amené.
  beneficiary_role    TEXT NOT NULL CHECK (beneficiary_role IN ('referrer','referee')),

  -- 'free_months' : un avoir Shopify (appCreditCreate) déduit de la prochaine
  --                 facture — le marchand n'a RIEN à approuver.
  -- 'ai_credits'  : repli si le token Partner API n'est pas configuré.
  -- 'commission'  : de l'argent, versé à la main par l'admin.
  reward_type         TEXT NOT NULL CHECK (reward_type IN ('free_months','ai_credits','commission')),

  months              INTEGER,   -- free_months
  credits             INTEGER,   -- ai_credits
  base_amount_cents   INTEGER,   -- commission : le montant payé par le filleul
  amount_cents        INTEGER,   -- commission : ce que touche le partenaire
  currency            TEXT NOT NULL DEFAULT 'eur',

  --  pending  → en attente (commission à verser, avoir à émettre)
  --  granted  → l'avoir Shopify / les crédits ont été émis
  --  paid     → la commission a été virée (marqué par l'admin)
  --  void     → annulé (remboursement, fraude)
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','granted','paid','void')),

  granted_at          TIMESTAMPTZ,
  -- L'identifiant de l'avoir Shopify émis (traçabilité).
  shopify_credit_id   TEXT,

  paid_at             TIMESTAMPTZ,
  payout_method       TEXT,
  payout_note         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ⚠️ L'IDEMPOTENCE EST ICI, dans le schéma.
  -- Une attribution ne produit qu'UNE récompense par bénéficiaire. Un callback
  -- de facturation rejoué (double-clic, refresh, retry réseau) se heurte à cette
  -- contrainte : la base refuse, le code n'a pas à y penser.
  UNIQUE (attribution_id, beneficiary_role),

  -- Le montant doit correspondre à la nature de la récompense.
  CONSTRAINT growth_rewards_amount_matches_type CHECK (
       (reward_type = 'free_months' AND months  IS NOT NULL)
    OR (reward_type = 'ai_credits'  AND credits IS NOT NULL)
    OR (reward_type = 'commission'  AND amount_cents IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_growth_rewards_benef
  ON growth_rewards (beneficiary_user_id, status);
CREATE INDEX IF NOT EXISTS idx_growth_rewards_attr
  ON growth_rewards (attribution_id);


-- ── 4. RLS ───────────────────────────────────────────────────────────
ALTER TABLE growth_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_rewards      ENABLE ROW LEVEL SECURITY;

-- Le porteur voit SON code (page /referral, page /partner).
DROP POLICY IF EXISTS growth_codes_owner_read ON growth_codes;
CREATE POLICY growth_codes_owner_read ON growth_codes
  FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

-- Le porteur voit les inscriptions générées par SON code — pas celles des autres.
DROP POLICY IF EXISTS growth_attr_owner_read ON growth_attributions;
CREATE POLICY growth_attr_owner_read ON growth_attributions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_codes c
     WHERE c.id = growth_attributions.code_id
       AND c.owner_user_id = (SELECT auth.uid())
  ));

-- Chacun voit SES récompenses. C'est ce qui permet enfin à un affilié de
-- consulter ses commissions : il n'existait AUCUNE page partenaire, les
-- conversions n'étaient lisibles que par l'admin.
DROP POLICY IF EXISTS growth_rewards_benef_read ON growth_rewards;
CREATE POLICY growth_rewards_benef_read ON growth_rewards
  FOR SELECT TO authenticated
  USING (beneficiary_user_id = (SELECT auth.uid()));

-- ⚠️ AUCUNE policy INSERT / UPDATE / DELETE — délibérément.
-- Toutes les écritures passent par le serveur (service_role, qui contourne la
-- RLS). Un marchand ne doit JAMAIS pouvoir s'auto-créditer une récompense en
-- appelant l'API REST directement.

COMMIT;

-- Sans ceci, PostgREST ne voit pas les nouvelles tables et répond
-- « relation does not exist » alors qu'elles existent bel et bien.
NOTIFY pgrst, 'reload schema';
