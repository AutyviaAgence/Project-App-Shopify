-- Migration: Condition d'arrêt de l'agent IA et notifications
-- À exécuter dans Supabase SQL Editor

-- 1. Ajouter le champ stop_condition aux agents IA
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS stop_condition TEXT;

COMMENT ON COLUMN ai_agents.stop_condition IS 'Condition en texte libre analysée par l''IA pour décider d''arrêter la conversation. Ex: "Arrêter après avoir envoyé le lien de rendez-vous"';

-- 2. Ajouter les nouveaux types d'alertes
-- D'abord, supprimer la contrainte existante
ALTER TABLE user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;

-- Recréer avec les nouveaux types (incluant booking_click pour les clics sur liens RDV)
ALTER TABLE user_alerts
ADD CONSTRAINT user_alerts_alert_type_check
CHECK (alert_type IN (
  'session_disconnected',
  'quota_reached',
  'ai_error',
  'webhook_error',
  'info',
  'campaign_opt_out',
  'agent_started',
  'agent_stopped',
  'booking_click'
));

COMMENT ON COLUMN user_alerts.alert_type IS 'Type d''alerte: session_disconnected, quota_reached, ai_error, webhook_error, info, campaign_opt_out, agent_started, agent_stopped, booking_click';
