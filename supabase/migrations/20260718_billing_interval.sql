-- =====================================================================
--  billing_interval : mensuel vs annuel pour les abonnements Shopify
--
--  L'infra Shopify (createAppSubscription) sait déjà facturer ANNUAL, mais
--  rien ne mémorisait l'intervalle choisi côté app. Cette colonne le stocke
--  pour afficher « /mois » vs « /an » et savoir quand renouveler.
--
--  Additif, non destructif. Défaut 'monthly' pour tout l'existant.
--  ⚠️ Après application manuelle : NOTIFY pgrst, 'reload schema';
-- =====================================================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';

-- Contrainte de validité (idempotente : on la (re)crée proprement).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_stores_billing_interval_check'
  ) THEN
    ALTER TABLE shopify_stores
      ADD CONSTRAINT shopify_stores_billing_interval_check
      CHECK (billing_interval IN ('monthly', 'annual'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
