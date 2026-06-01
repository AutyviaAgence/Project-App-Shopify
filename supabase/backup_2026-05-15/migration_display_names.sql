-- Migration: Ajout display_name aux sessions WhatsApp
-- Date: 2025-01-31

-- Ajouter la colonne display_name aux sessions
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Commentaire pour documentation
COMMENT ON COLUMN whatsapp_sessions.display_name IS 'Nom personnalisé de la session défini par l''utilisateur';

-- Index pour recherche par nom
CREATE INDEX IF NOT EXISTS idx_sessions_display_name
ON whatsapp_sessions(display_name)
WHERE display_name IS NOT NULL;
