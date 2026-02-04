-- Migration: Ajouter la colonne de rétention des données au profil
-- Date: 2026-02-04
-- Description: Permet aux utilisateurs de configurer une durée de conservation des messages

-- Ajouter la colonne de rétention des données
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS data_retention_months INTEGER DEFAULT NULL;

-- Commentaire pour documenter la colonne
COMMENT ON COLUMN profiles.data_retention_months IS 'Durée de conservation des messages en mois. NULL = conservation indéfinie.';
