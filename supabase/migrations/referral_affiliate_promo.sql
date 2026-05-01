-- =============================================================
-- Migration: Système de parrainage, affiliation et codes promo
-- =============================================================

-- 1. Colonnes referral sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

-- 2. Table des récompenses de parrainage (tokens)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id),
  referee_id  UUID NOT NULL REFERENCES profiles(id),
  rewarded_user_id UUID NOT NULL REFERENCES profiles(id),
  tokens_credited INTEGER NOT NULL DEFAULT 500000,
  trigger_event TEXT NOT NULL, -- 'subscription' | 'audit'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, referee_id, trigger_event)
);

-- 3. Table des codes d'affiliation classiques (commission 30%)
CREATE TABLE IF NOT EXISTS affiliate_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  code TEXT NOT NULL UNIQUE,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Table des conversions affiliées (commissions dues)
CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code_id UUID NOT NULL REFERENCES affiliate_codes(id),
  affiliate_user_id UUID NOT NULL REFERENCES profiles(id),
  converted_user_id UUID NOT NULL REFERENCES profiles(id),
  amount_paid_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid
  payout_method TEXT, -- 'transfer' | 'credit'
  paid_at TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Table des codes promo Stripe
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  stripe_coupon_id TEXT,
  stripe_promo_code_id TEXT,
  discount_percent NUMERIC(5,2) NOT NULL,
  max_redemptions INTEGER,
  applies_to TEXT NOT NULL DEFAULT 'both', -- 'subscription' | 'audit' | 'both'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Trigger: générer un referral_code unique à chaque nouvel utilisateur
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    new_code := upper(substring(md5(random()::text || NEW.id::text) from 1 for 8));
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = new_code) THEN
      NEW.referral_code := new_code;
      EXIT;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      NEW.referral_code := upper(substring(md5(NEW.id::text) from 1 for 12));
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION generate_referral_code();

-- 7. Mettre à jour handle_new_user pour résoudre referred_by_code → UUID
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referred_by_uuid UUID;
  ref_code TEXT;
BEGIN
  ref_code := NEW.raw_user_meta_data->>'referred_by_code';

  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO referred_by_uuid
    FROM profiles
    WHERE referral_code = upper(ref_code)
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    referred_by_uuid
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 8. Générer des codes pour les profils existants sans code
UPDATE profiles
SET referral_code = upper(substring(md5(random()::text || id::text) from 1 for 8))
WHERE referral_code IS NULL;

-- 9. RLS policies
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own referral rewards" ON referral_rewards
  FOR SELECT USING (rewarded_user_id = auth.uid() OR referrer_id = auth.uid() OR referee_id = auth.uid());

ALTER TABLE affiliate_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own affiliate codes" ON affiliate_codes
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own conversions" ON affiliate_conversions
  FOR SELECT USING (affiliate_user_id = auth.uid());

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
-- Promo codes are admin-only via service role key; no user-facing select needed
