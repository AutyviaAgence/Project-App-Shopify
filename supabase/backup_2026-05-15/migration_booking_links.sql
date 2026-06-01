-- Migration: Liens de rendez-vous trackables pour agents IA
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Ajouter le champ booking_url dans ai_agents
-- =============================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS booking_url TEXT DEFAULT NULL;

COMMENT ON COLUMN ai_agents.booking_url IS 'URL de prise de rendez-vous (Calendly, Cal.com, etc.) que l''agent peut partager';

-- =============================================
-- 2. Créer la table de tracking des clics sur liens RDV
-- =============================================

CREATE TABLE IF NOT EXISTS booking_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  user_agent TEXT,
  ip_hash TEXT, -- Hash de l'IP pour anonymisation
  referer TEXT,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes de stats
CREATE INDEX IF NOT EXISTS idx_booking_clicks_agent_id ON booking_link_clicks(agent_id);
CREATE INDEX IF NOT EXISTS idx_booking_clicks_clicked_at ON booking_link_clicks(clicked_at);
CREATE INDEX IF NOT EXISTS idx_booking_clicks_conversation ON booking_link_clicks(conversation_id);

COMMENT ON TABLE booking_link_clicks IS 'Tracking des clics sur les liens de rendez-vous des agents IA';

-- =============================================
-- 3. RLS pour booking_link_clicks
-- =============================================

ALTER TABLE booking_link_clicks ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies existantes si elles existent
DROP POLICY IF EXISTS "Users can view booking clicks for their agents" ON booking_link_clicks;
DROP POLICY IF EXISTS "Service can insert booking clicks" ON booking_link_clicks;

-- Politique de lecture : propriétaire de l'agent ou membre de l'équipe
CREATE POLICY "Users can view booking clicks for their agents"
  ON booking_link_clicks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = booking_link_clicks.agent_id
      AND (
        a.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = a.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
        )
      )
    )
  );

-- Politique d'insertion : via API (service role)
CREATE POLICY "Service can insert booking clicks"
  ON booking_link_clicks
  FOR INSERT
  WITH CHECK (true);

-- =============================================
-- 4. Vue pour les stats de clics par agent
-- =============================================

CREATE OR REPLACE VIEW booking_clicks_stats AS
SELECT
  agent_id,
  COUNT(*) as total_clicks,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  COUNT(DISTINCT contact_id) as unique_contacts,
  DATE_TRUNC('day', clicked_at) as click_date
FROM booking_link_clicks
GROUP BY agent_id, DATE_TRUNC('day', clicked_at);

COMMENT ON VIEW booking_clicks_stats IS 'Statistiques agrégées des clics sur liens de RDV par agent';
