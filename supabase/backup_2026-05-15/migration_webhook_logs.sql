-- Migration: Logs des webhooks Evolution API
-- À exécuter dans Supabase SQL Editor

-- Table pour stocker les logs webhook
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  payload JSONB,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'skipped')),
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_webhook_logs_session ON webhook_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);

-- RLS
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Politique : les utilisateurs peuvent voir les logs de leurs sessions
CREATE POLICY "Users can view webhook logs for their sessions"
  ON webhook_logs FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()
    )
  );

-- Auto-nettoyage des vieux logs (garder 7 jours)
-- À exécuter manuellement ou via un cron job Supabase
-- DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '7 days';

COMMENT ON TABLE webhook_logs IS 'Logs des événements webhook Evolution API';
COMMENT ON COLUMN webhook_logs.event_type IS 'Type d''événement (messages.upsert, connection.update, qrcode.updated, etc.)';
COMMENT ON COLUMN webhook_logs.processing_time_ms IS 'Temps de traitement en millisecondes';
