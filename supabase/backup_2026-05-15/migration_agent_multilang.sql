-- Migration: Support multi-langue pour les agents IA
-- À exécuter dans Supabase SQL Editor

-- Ajouter la colonne pour activer la détection automatique de langue
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS auto_detect_language BOOLEAN DEFAULT false;

COMMENT ON COLUMN ai_agents.auto_detect_language IS 'Détecte automatiquement la langue du message et répond dans la même langue';
