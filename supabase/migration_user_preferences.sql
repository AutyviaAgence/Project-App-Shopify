-- Migration: Ajouter les préférences utilisateur (timezone)
-- Date: 2026-02-01

-- Ajouter le champ timezone à la table profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Paris';

-- Créer un index pour les requêtes par timezone (utile pour les campagnes planifiées)
CREATE INDEX IF NOT EXISTS idx_profiles_timezone ON profiles(timezone);

-- Commentaire sur la colonne
COMMENT ON COLUMN profiles.timezone IS 'Fuseau horaire de l''utilisateur (format IANA, ex: Europe/Paris)';
