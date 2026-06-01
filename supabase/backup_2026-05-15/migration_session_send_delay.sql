-- ============================================================================
-- Migration: Délai entre les envois automatiques par session
-- ============================================================================
-- Exécuter ce fichier dans le SQL Editor de Supabase.
-- NULL = pas de délai (comportement actuel préservé).
-- Valeur en secondes (ex: 5 = 5 secondes entre chaque envoi automatique).
-- ============================================================================

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS ai_message_delay INTEGER;
