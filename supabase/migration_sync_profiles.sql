-- Migration: Synchronisation des profils utilisateurs
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Mettre à jour le trigger pour inclure avatar_url
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. Synchroniser les profils existants
-- =============================================

-- Mettre à jour les profils existants avec les données de auth.users
UPDATE profiles p
SET
  full_name = COALESCE(
    p.full_name,
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  avatar_url = COALESCE(
    p.avatar_url,
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture'
  ),
  email = u.email,
  updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id;

-- =============================================
-- 3. Créer les profils manquants
-- =============================================

INSERT INTO profiles (id, email, full_name, avatar_url)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 4. Fonction pour synchroniser manuellement un profil
-- =============================================

CREATE OR REPLACE FUNCTION sync_user_profile(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles p
  SET
    full_name = COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      p.full_name,
      split_part(u.email, '@', 1)
    ),
    avatar_url = COALESCE(
      u.raw_user_meta_data->>'avatar_url',
      u.raw_user_meta_data->>'picture',
      p.avatar_url
    ),
    email = u.email,
    updated_at = NOW()
  FROM auth.users u
  WHERE p.id = user_id AND u.id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_user_profile IS 'Synchronise le profil d''un utilisateur avec auth.users';
