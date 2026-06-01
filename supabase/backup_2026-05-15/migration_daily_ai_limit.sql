-- ============================================================================
-- Migration: Limite quotidienne de messages IA par session
-- ============================================================================
-- Exécuter ce fichier dans le SQL Editor de Supabase.
-- NULL = illimité (comportement actuel préservé).
-- ============================================================================

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS daily_ai_message_limit INTEGER;
