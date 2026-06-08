-- =====================================================================
--  FIX — Suppression d'utilisateur bloquée (erreur 400 dans Studio)
--  Date : 2026-06-09
--
--  Cause : les FK du système referral/affiliation pointant vers profiles
--  sont en ON DELETE NO ACTION → bloquent la suppression d'un auth.users
--  (la cascade auth.users → profiles échoue).
--
--  Correctif : passer ces FK en ON DELETE SET NULL (on conserve
--  l'historique d'affiliation/parrainage, on perd juste le lien user).
--  Les colonnes NOT NULL concernées sont rendues nullable au préalable.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

-- --- Rendre nullable les colonnes NOT NULL ciblées (requis pour SET NULL) ---
ALTER TABLE affiliate_conversions ALTER COLUMN affiliate_user_id DROP NOT NULL;
ALTER TABLE affiliate_conversions ALTER COLUMN converted_user_id DROP NOT NULL;
ALTER TABLE referral_rewards      ALTER COLUMN referrer_id       DROP NOT NULL;
ALTER TABLE referral_rewards      ALTER COLUMN referee_id        DROP NOT NULL;
ALTER TABLE referral_rewards      ALTER COLUMN rewarded_user_id  DROP NOT NULL;

-- --- affiliate_codes.user_id ---
ALTER TABLE affiliate_codes DROP CONSTRAINT affiliate_codes_user_id_fkey;
ALTER TABLE affiliate_codes ADD  CONSTRAINT affiliate_codes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- --- affiliate_conversions ---
ALTER TABLE affiliate_conversions DROP CONSTRAINT affiliate_conversions_affiliate_user_id_fkey;
ALTER TABLE affiliate_conversions ADD  CONSTRAINT affiliate_conversions_affiliate_user_id_fkey
  FOREIGN KEY (affiliate_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE affiliate_conversions DROP CONSTRAINT affiliate_conversions_converted_user_id_fkey;
ALTER TABLE affiliate_conversions ADD  CONSTRAINT affiliate_conversions_converted_user_id_fkey
  FOREIGN KEY (converted_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- --- profiles.referred_by ---
ALTER TABLE profiles DROP CONSTRAINT profiles_referred_by_fkey;
ALTER TABLE profiles ADD  CONSTRAINT profiles_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- --- referral_rewards ---
ALTER TABLE referral_rewards DROP CONSTRAINT referral_rewards_referrer_id_fkey;
ALTER TABLE referral_rewards ADD  CONSTRAINT referral_rewards_referrer_id_fkey
  FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referral_rewards DROP CONSTRAINT referral_rewards_referee_id_fkey;
ALTER TABLE referral_rewards ADD  CONSTRAINT referral_rewards_referee_id_fkey
  FOREIGN KEY (referee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referral_rewards DROP CONSTRAINT referral_rewards_rewarded_user_id_fkey;
ALTER TABLE referral_rewards ADD  CONSTRAINT referral_rewards_rewarded_user_id_fkey
  FOREIGN KEY (rewarded_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

COMMIT;
