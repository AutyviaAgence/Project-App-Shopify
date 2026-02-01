-- Migration: Tracking des propositions de RDV par les agents IA
-- Date: 2026-02-01

-- =============================================
-- 1. Ajouter une table pour tracker les propositions de RDV
-- =============================================
-- On track chaque fois que l'agent propose un lien de RDV dans sa réponse

CREATE TABLE IF NOT EXISTS booking_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  clicked BOOLEAN DEFAULT false,  -- mis à jour quand un clic est enregistré
  clicked_at TIMESTAMPTZ
);

-- Index pour les requêtes de stats
CREATE INDEX IF NOT EXISTS idx_booking_proposals_agent_id ON booking_proposals(agent_id);
CREATE INDEX IF NOT EXISTS idx_booking_proposals_proposed_at ON booking_proposals(proposed_at);
CREATE INDEX IF NOT EXISTS idx_booking_proposals_conversation ON booking_proposals(conversation_id);

COMMENT ON TABLE booking_proposals IS 'Tracking des propositions de liens de RDV par les agents IA';

-- =============================================
-- 2. RLS pour booking_proposals
-- =============================================

ALTER TABLE booking_proposals ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies existantes si elles existent
DROP POLICY IF EXISTS "Users can view booking proposals for their agents" ON booking_proposals;
DROP POLICY IF EXISTS "Service can insert booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Service can update booking proposals" ON booking_proposals;

-- Politique de lecture : propriétaire de l'agent ou membre de l'équipe
CREATE POLICY "Users can view booking proposals for their agents"
  ON booking_proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_agents a
      WHERE a.id = booking_proposals.agent_id
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
CREATE POLICY "Service can insert booking proposals"
  ON booking_proposals
  FOR INSERT
  WITH CHECK (true);

-- Politique de mise à jour : via API (service role)
CREATE POLICY "Service can update booking proposals"
  ON booking_proposals
  FOR UPDATE
  USING (true);

-- =============================================
-- 3. Modifier booking_link_clicks pour lier aux propositions
-- =============================================

ALTER TABLE booking_link_clicks
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES booking_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_clicks_proposal ON booking_link_clicks(proposal_id);
