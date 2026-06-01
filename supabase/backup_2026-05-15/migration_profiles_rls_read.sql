-- Migration: Permettre aux utilisateurs authentifiés de lire les profils basiques
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Vérifier et créer les policies RLS pour profiles
-- =============================================

-- Permettre aux utilisateurs authentifiés de lire les profils de tous les utilisateurs
-- (nécessaire pour voir les noms/avatars des membres d'équipe)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Permettre aux utilisateurs de mettre à jour uniquement leur propre profil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Permettre l'insertion par le trigger (service role)
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- =============================================
-- 2. S'assurer que RLS est activé
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. Synchroniser les profils existants qui n'ont pas de full_name
-- =============================================
UPDATE profiles p
SET
  full_name = COALESCE(
    p.full_name,
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  email = COALESCE(p.email, u.email),
  updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND (p.full_name IS NULL OR p.email IS NULL);
