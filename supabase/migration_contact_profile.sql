-- ============================================================================
-- Contact Profile Enhancement - Migration
-- ============================================================================
-- Exécuter ce fichier dans le SQL Editor de Supabase.
-- ============================================================================

-- Champs de profil éditables par l'utilisateur
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Résumé IA de la conversation
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ;
