-- Migration: Système d'alertes utilisateur
-- À exécuter dans Supabase SQL Editor

-- Table des alertes
CREATE TABLE IF NOT EXISTS user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('session_disconnected', 'quota_reached', 'ai_error', 'webhook_error', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_alerts_user ON user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON user_alerts(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON user_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON user_alerts(alert_type);

-- RLS
ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON user_alerts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own alerts"
  ON user_alerts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own alerts"
  ON user_alerts FOR DELETE
  USING (user_id = auth.uid());

-- Permettre l'insertion via service_role (webhook)
-- Pas de policy INSERT pour les utilisateurs normaux

-- Fonction pour créer une alerte (utilisable depuis le webhook)
CREATE OR REPLACE FUNCTION create_user_alert(
  p_user_id UUID,
  p_alert_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO user_alerts (user_id, alert_type, title, message, metadata)
  VALUES (p_user_id, p_alert_type, p_title, p_message, p_metadata)
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

-- Auto-nettoyage des vieilles alertes lues (garder 30 jours)
-- À exécuter manuellement ou via un cron job Supabase
-- DELETE FROM user_alerts WHERE is_read = true AND created_at < NOW() - INTERVAL '30 days';

COMMENT ON TABLE user_alerts IS 'Alertes et notifications utilisateur';
COMMENT ON COLUMN user_alerts.alert_type IS 'Type d''alerte: session_disconnected, quota_reached, ai_error, webhook_error, info';
