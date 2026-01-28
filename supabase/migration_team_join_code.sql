-- Migration: Ajouter un code de jonction aux équipes
-- À exécuter dans Supabase SQL Editor

-- Ajouter la colonne join_code
ALTER TABLE teams ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;

-- Fonction pour générer un code court unique (ex: AUTY-7X3K)
CREATE OR REPLACE FUNCTION generate_team_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  -- Générer 4 caractères aléatoires
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN 'AUTY-' || code;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour générer automatiquement le code à la création
CREATE OR REPLACE FUNCTION set_team_join_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  attempts INTEGER := 0;
BEGIN
  LOOP
    new_code := generate_team_join_code();
    -- Vérifier l'unicité
    IF NOT EXISTS (SELECT 1 FROM teams WHERE join_code = new_code) THEN
      NEW.join_code := new_code;
      EXIT;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Unable to generate unique join code';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_team_set_join_code ON teams;
CREATE TRIGGER on_team_set_join_code
  BEFORE INSERT ON teams
  FOR EACH ROW
  WHEN (NEW.join_code IS NULL)
  EXECUTE FUNCTION set_team_join_code();

-- Générer des codes pour les équipes existantes qui n'en ont pas
DO $$
DECLARE
  team_record RECORD;
  new_code TEXT;
BEGIN
  FOR team_record IN SELECT id FROM teams WHERE join_code IS NULL LOOP
    LOOP
      new_code := generate_team_join_code();
      IF NOT EXISTS (SELECT 1 FROM teams WHERE join_code = new_code) THEN
        UPDATE teams SET join_code = new_code WHERE id = team_record.id;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Index pour recherche rapide par code
CREATE INDEX IF NOT EXISTS idx_teams_join_code ON teams(join_code);
