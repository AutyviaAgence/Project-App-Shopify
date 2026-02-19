-- Migration: Système d'abonnement et période d'essai
-- À exécuter dans Supabase SQL Editor

-- 1. Ajouter les champs d'abonnement au profil utilisateur
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Ajouter la contrainte CHECK après (pour éviter les erreurs si elle existe déjà)
DO $$
BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_status_check
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 2. Mettre à jour les utilisateurs existants avec une période d'essai de 14 jours à partir de leur création
UPDATE profiles
SET
  subscription_status = 'trial',
  trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

-- 3. Mettre à jour le trigger pour initialiser la période d'essai lors de l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url, subscription_status, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'trial',
    NOW() + INTERVAL '14 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    subscription_status = COALESCE(profiles.subscription_status, 'trial'),
    trial_ends_at = COALESCE(profiles.trial_ends_at, NOW() + INTERVAL '14 days'),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 3. Créer une table pour l'historique des paiements
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- en centimes (15000 = 150€)
  currency TEXT DEFAULT 'eur',
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at ON profiles(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);

-- 5. RLS pour payment_history
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payment history"
ON payment_history FOR SELECT
USING (auth.uid() = user_id);

-- 6. Fonction pour vérifier si un utilisateur a un abonnement actif
CREATE OR REPLACE FUNCTION is_subscription_active(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT subscription_status, trial_ends_at, subscription_ends_at
  INTO profile_record
  FROM profiles
  WHERE id = user_uuid;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Trial actif
  IF profile_record.subscription_status = 'trial' AND profile_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;

  -- Abonnement actif
  IF profile_record.subscription_status = 'active' AND (profile_record.subscription_ends_at IS NULL OR profile_record.subscription_ends_at > NOW()) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Commentaires
COMMENT ON COLUMN profiles.subscription_status IS 'Statut: trial (essai 14j), active (payé), expired (expiré), cancelled (annulé)';
COMMENT ON COLUMN profiles.trial_ends_at IS 'Date de fin de la période d''essai gratuite (14 jours après inscription)';
COMMENT ON COLUMN profiles.subscription_ends_at IS 'Date de fin de l''abonnement payant';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'ID client Stripe';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'ID abonnement Stripe';
