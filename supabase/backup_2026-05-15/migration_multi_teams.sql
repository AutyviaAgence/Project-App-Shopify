-- Migration: Support multi-équipes pour sessions, agents, documents et liens
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Tables de liaison pour les sessions WhatsApp
-- =============================================

CREATE TABLE IF NOT EXISTS session_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_session_teams_session ON session_teams(session_id);
CREATE INDEX IF NOT EXISTS idx_session_teams_team ON session_teams(team_id);

-- Migrer les données existantes (team_id -> session_teams)
INSERT INTO session_teams (session_id, team_id)
SELECT id, team_id FROM whatsapp_sessions WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 2. Tables de liaison pour les agents IA
-- =============================================

CREATE TABLE IF NOT EXISTS agent_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_teams_agent ON agent_teams(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_teams_team ON agent_teams(team_id);

-- Migrer les données existantes
INSERT INTO agent_teams (agent_id, team_id)
SELECT id, team_id FROM ai_agents WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 3. Tables de liaison pour les documents knowledge
-- =============================================

CREATE TABLE IF NOT EXISTS document_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_document_teams_document ON document_teams(document_id);
CREATE INDEX IF NOT EXISTS idx_document_teams_team ON document_teams(team_id);

-- Migrer les données existantes
INSERT INTO document_teams (document_id, team_id)
SELECT id, team_id FROM knowledge_documents WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 4. Tables de liaison pour les liens WhatsApp
-- =============================================

CREATE TABLE IF NOT EXISTS link_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES wa_links(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(link_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_link_teams_link ON link_teams(link_id);
CREATE INDEX IF NOT EXISTS idx_link_teams_team ON link_teams(team_id);

-- Migrer les données existantes
INSERT INTO link_teams (link_id, team_id)
SELECT id, team_id FROM wa_links WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 5. RLS pour les nouvelles tables
-- =============================================

-- Session teams
ALTER TABLE session_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view session_teams for their sessions or teams" ON session_teams;
DROP POLICY IF EXISTS "Users can manage session_teams for their sessions" ON session_teams;

CREATE POLICY "Users can view session_teams for their sessions or teams"
  ON session_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_sessions s WHERE s.id = session_teams.session_id AND s.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = session_teams.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can manage session_teams for their sessions"
  ON session_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_sessions s WHERE s.id = session_teams.session_id AND s.user_id = auth.uid()
    )
  );

-- Agent teams
ALTER TABLE agent_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view agent_teams for their agents or teams" ON agent_teams;
DROP POLICY IF EXISTS "Users can manage agent_teams for their agents" ON agent_teams;

CREATE POLICY "Users can view agent_teams for their agents or teams"
  ON agent_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_agents a WHERE a.id = agent_teams.agent_id AND a.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = agent_teams.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can manage agent_teams for their agents"
  ON agent_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_agents a WHERE a.id = agent_teams.agent_id AND a.user_id = auth.uid()
    )
  );

-- Document teams
ALTER TABLE document_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view document_teams for their documents or teams" ON document_teams;
DROP POLICY IF EXISTS "Users can manage document_teams for their documents" ON document_teams;

CREATE POLICY "Users can view document_teams for their documents or teams"
  ON document_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_documents d WHERE d.id = document_teams.document_id AND d.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = document_teams.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can manage document_teams for their documents"
  ON document_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_documents d WHERE d.id = document_teams.document_id AND d.user_id = auth.uid()
    )
  );

-- Link teams
ALTER TABLE link_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view link_teams for their links or teams" ON link_teams;
DROP POLICY IF EXISTS "Users can manage link_teams for their links" ON link_teams;

CREATE POLICY "Users can view link_teams for their links or teams"
  ON link_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wa_links l WHERE l.id = link_teams.link_id AND l.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = link_teams.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can manage link_teams for their links"
  ON link_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM wa_links l WHERE l.id = link_teams.link_id AND l.user_id = auth.uid()
    )
  );

-- =============================================
-- 6. Fonctions helper pour récupérer les équipes
-- =============================================

-- Fonction pour récupérer les team_ids d'une session
CREATE OR REPLACE FUNCTION get_session_team_ids(p_session_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM session_teams
  WHERE session_id = p_session_id;
$$ LANGUAGE SQL STABLE;

-- Fonction pour récupérer les team_ids d'un agent
CREATE OR REPLACE FUNCTION get_agent_team_ids(p_agent_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM agent_teams
  WHERE agent_id = p_agent_id;
$$ LANGUAGE SQL STABLE;

-- Fonction pour récupérer les team_ids d'un document
CREATE OR REPLACE FUNCTION get_document_team_ids(p_document_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM document_teams
  WHERE document_id = p_document_id;
$$ LANGUAGE SQL STABLE;

-- Fonction pour récupérer les team_ids d'un lien
CREATE OR REPLACE FUNCTION get_link_team_ids(p_link_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM link_teams
  WHERE link_id = p_link_id;
$$ LANGUAGE SQL STABLE;

COMMENT ON TABLE session_teams IS 'Association sessions WhatsApp <-> équipes (many-to-many)';
COMMENT ON TABLE agent_teams IS 'Association agents IA <-> équipes (many-to-many)';
COMMENT ON TABLE document_teams IS 'Association documents knowledge <-> équipes (many-to-many)';
COMMENT ON TABLE link_teams IS 'Association liens WhatsApp <-> équipes (many-to-many)';
