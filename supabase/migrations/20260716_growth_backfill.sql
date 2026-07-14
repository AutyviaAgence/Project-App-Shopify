-- =====================================================================
--  REPRISE DE L'EXISTANT — moteur de croissance
--  2026-07-16
--
--  Le trigger ne couvre que les NOUVELLES inscriptions. Les comptes déjà
--  créés n'ont donc pas de code dans le nouveau moteur : sans cette reprise,
--  un marchand existant verrait une page de parrainage vide, et les
--  commissions déjà dues disparaîtraient.
--
--  On CONSERVE le code de parrainage historique (`profiles.referral_code`)
--  quand il existe : les liens déjà partagés continuent de fonctionner.
--
--  Idempotent : peut être rejoué sans dommage.
-- =====================================================================

BEGIN;

-- ── 1. Un code de parrainage pour chaque compte existant ─────────────
INSERT INTO growth_codes (kind, owner_user_id, code, reward_months)
SELECT
  'referral',
  p.id,
  -- On réutilise le code historique : les liens déjà partagés restent valides.
  COALESCE(
    NULLIF(p.referral_code, ''),
    upper(substring(md5(p.id::text) from 1 for 8))
  ),
  1
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM growth_codes g
   WHERE g.kind = 'referral' AND g.owner_user_id = p.id
)
ON CONFLICT DO NOTHING;

-- ── 2. Les codes d'affiliation existants ─────────────────────────────
--
-- ⚠️ `owner_user_id` peut être NULL : l'ancienne route d'admin ne le
-- renseignait jamais (alors que la colonne était NOT NULL). C'est précisément
-- pour ça que le partenaire n'était rattaché à rien et ne voyait jamais ses
-- commissions. Le nouveau modèle l'accepte et permet de le rattacher plus tard.
INSERT INTO growth_codes (kind, owner_user_id, code, label, commission_percent, is_active, created_at)
SELECT
  'affiliate',
  a.user_id,
  a.code,
  a.label,
  -- La contrainte exige un taux pour un affilié : on retombe sur 30 %, la
  -- valeur que proposait l'interface d'admin.
  COALESCE(a.commission_percent, 30),
  COALESCE(a.is_active, true),
  a.created_at
FROM affiliate_codes a
WHERE NOT EXISTS (
  SELECT 1 FROM growth_codes g WHERE upper(g.code) = upper(a.code)
)
ON CONFLICT DO NOTHING;

-- ── 3. Les parrainages déjà attribués ────────────────────────────────
INSERT INTO growth_attributions (code_id, referee_id, attributed_at)
SELECT g.id, p.id, p.created_at
  FROM profiles p
  JOIN growth_codes g
    ON g.kind = 'referral' AND g.owner_user_id = p.referred_by
 WHERE p.referred_by IS NOT NULL
ON CONFLICT (referee_id) DO NOTHING;

-- ── 4. Les commissions déjà dues ─────────────────────────────────────
--
-- On préserve leur statut : une commission déjà versée ne doit pas
-- réapparaître comme « à payer ».
INSERT INTO growth_rewards (
  attribution_id, beneficiary_user_id, beneficiary_role,
  reward_type, base_amount_cents, amount_cents, currency,
  status, paid_at, payout_method, created_at
)
SELECT
  ga.id,
  c.affiliate_user_id,
  'referrer',
  'commission',
  c.amount_paid_cents,
  c.commission_cents,
  COALESCE(c.currency, 'eur'),
  CASE WHEN c.status = 'paid' THEN 'paid' ELSE 'pending' END,
  c.paid_at,
  c.payout_method,
  c.created_at
FROM affiliate_conversions c
JOIN growth_attributions ga ON ga.referee_id = c.converted_user_id
WHERE c.commission_cents IS NOT NULL
ON CONFLICT (attribution_id, beneficiary_role) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
