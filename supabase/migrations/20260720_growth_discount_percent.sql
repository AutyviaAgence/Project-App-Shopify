-- Remise accordée AU MARCHAND par un code d'affiliation.
--
-- `commission_percent` existait déjà, mais c'est ce que touche l'AFFILIÉ — rien
-- ne revenait au marchand qui utilisait le code. Un partenaire ne pouvait donc
-- pas proposer « -20 % avec mon code », l'argument commercial le plus banal.
--
-- Colonne SÉPARÉE, volontairement : les deux pourcentages n'ont ni le même
-- bénéficiaire ni la même échéance. La commission se règle au premier paiement
-- encaissé ; la remise s'applique sur l'abonnement Shopify, à la souscription.
-- Les fusionner rendrait impossible « 30 % pour l'affilié, 20 % pour le
-- marchand » — c'est-à-dire le cas normal.
-- 0 est une valeur VALIDE, pas une absence : un partenaire peut apporter des
-- clients sans leur accorder de remise (il touche sa commission, le marchand
-- paie plein tarif). `NULL` et `0` sont donc deux choses différentes ici —
-- d'où `>= 0` et non `> 0`.
ALTER TABLE growth_codes
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC
    CHECK (
      discount_percent IS NULL
      OR (discount_percent >= 0 AND discount_percent <= 100)
    );

-- Durée de la remise, en cycles de facturation. NULL = permanente (tant que
-- l'abonnement court). Même sémantique que `promo_codes.duration_months`, pour
-- que les deux systèmes se comportent pareil côté Shopify.
ALTER TABLE growth_codes
  ADD COLUMN IF NOT EXISTS discount_duration_months INTEGER
    CHECK (discount_duration_months IS NULL OR discount_duration_months > 0);

COMMENT ON COLUMN growth_codes.discount_percent IS
  'Remise accordée au MARCHAND qui utilise ce code (0-100). NULL = aucune remise. À ne pas confondre avec commission_percent, qui rémunère l''affilié.';

COMMENT ON COLUMN growth_codes.discount_duration_months IS
  'Nombre de cycles de facturation concernés par discount_percent. NULL = permanente.';

-- ⚠️ Sans ceci, l'API Supabase (PostgREST) ne voit pas les nouvelles colonnes.
NOTIFY pgrst, 'reload schema';
