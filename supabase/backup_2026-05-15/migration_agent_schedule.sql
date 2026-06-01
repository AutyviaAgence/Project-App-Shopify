-- Migration: Horaires d'activité pour les agents IA
-- À exécuter dans Supabase SQL Editor

-- Ajouter les colonnes d'horaires sur la table ai_agents
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'Europe/Paris',
  ADD COLUMN IF NOT EXISTS schedule_start_time TIME DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS schedule_end_time TIME DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5]; -- 0=dim, 1=lun, ..., 6=sam

-- Index pour les recherches par horaires
CREATE INDEX IF NOT EXISTS idx_agents_schedule ON ai_agents(schedule_enabled, is_active);

COMMENT ON COLUMN ai_agents.schedule_enabled IS 'Active la restriction par horaires';
COMMENT ON COLUMN ai_agents.schedule_timezone IS 'Fuseau horaire pour les horaires (ex: Europe/Paris)';
COMMENT ON COLUMN ai_agents.schedule_start_time IS 'Heure de début d''activité (format HH:MM)';
COMMENT ON COLUMN ai_agents.schedule_end_time IS 'Heure de fin d''activité (format HH:MM)';
COMMENT ON COLUMN ai_agents.schedule_days IS 'Jours d''activité (0=dimanche, 1=lundi, ..., 6=samedi)';
