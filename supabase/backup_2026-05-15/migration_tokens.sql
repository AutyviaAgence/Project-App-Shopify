-- Migration: Système de limite de tokens OpenAI
-- À exécuter dans Supabase SQL Editor

-- 1. Ajouter les colonnes de tracking de tokens
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tokens_used bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_limit bigint NOT NULL DEFAULT 200000,
ADD COLUMN IF NOT EXISTS token_usage_period_start timestamptz DEFAULT now();

-- 2. Mettre à jour les utilisateurs actifs avec la limite payante
UPDATE profiles SET tokens_limit = 5000000 WHERE subscription_status = 'active';
UPDATE profiles SET tokens_limit = 200000 WHERE subscription_status = 'trial';
UPDATE profiles SET tokens_limit = 0 WHERE subscription_status IN ('expired', 'cancelled');

-- 3. Fonction RPC pour incrémenter atomiquement les tokens
CREATE OR REPLACE FUNCTION increment_token_usage(p_user_id uuid, p_tokens int)
RETURNS TABLE(new_total bigint, token_limit bigint) AS $$
  UPDATE profiles
  SET tokens_used = tokens_used + p_tokens
  WHERE id = p_user_id
  RETURNING tokens_used AS new_total, tokens_limit AS token_limit;
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Commentaires
COMMENT ON COLUMN profiles.tokens_used IS 'Nombre de tokens OpenAI utilisés dans la période courante';
COMMENT ON COLUMN profiles.tokens_limit IS 'Limite de tokens: 200000 (trial), 5000000 (payant), ajustable par achat';
COMMENT ON COLUMN profiles.token_usage_period_start IS 'Début de la période de comptage des tokens';
