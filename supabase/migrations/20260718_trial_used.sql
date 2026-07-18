-- =====================================================================
--  trial_used_at : marqueur « essai gratuit déjà consommé »
--
--  ⚠️ La Billing API (appSubscriptionCreate + trialDays) N'A PAS la protection
--  anti-abus des 180 jours de « Shopify App Pricing ». Sans garde-fou, un
--  marchand peut s'abonner → annuler → se réabonner et obtenir un NOUVEL essai
--  de 7 jours, en boucle. Cette colonne garantit UN SEUL essai par boutique.
--
--  Posée au CALLBACK (paiement confirmé = essai réellement démarré), jamais au
--  subscribe (un marchand qui n'approuve pas ne doit pas « brûler » son essai).
--
--  Additif, non destructif. NULL = jamais eu d'essai → essai accordé.
--  ⚠️ Après application manuelle : NOTIFY pgrst, 'reload schema';
-- =====================================================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS trial_used_at timestamptz;

NOTIFY pgrst, 'reload schema';
