-- ============================================================================
-- Agent Conversation Limits - Migration
-- ============================================================================
-- Exécuter ce fichier dans le SQL Editor de Supabase.
-- ============================================================================

-- Nombre maximum de messages par conversation (NULL = illimité)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS max_messages_per_conversation INTEGER;

-- Timeout d'inactivité en minutes (NULL = désactivé)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes INTEGER;
