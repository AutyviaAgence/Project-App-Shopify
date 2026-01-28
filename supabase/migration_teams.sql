-- Migration: Système d'équipes multi-utilisateurs
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Table des équipes
-- =============================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug) WHERE slug IS NOT NULL;

COMMENT ON TABLE teams IS 'Équipes permettant le partage de ressources entre utilisateurs';
COMMENT ON COLUMN teams.slug IS 'Identifiant URL-friendly unique (optionnel)';

-- =============================================
-- 2. Table des membres d'équipe
-- =============================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invitation_token TEXT UNIQUE,
  status TEXT DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_token ON team_members(invitation_token) WHERE invitation_token IS NOT NULL;

COMMENT ON TABLE team_members IS 'Membres des équipes avec leurs rôles';
COMMENT ON COLUMN team_members.role IS 'Rôle: owner (propriétaire), admin (administrateur), member (membre)';
COMMENT ON COLUMN team_members.invitation_token IS 'Token unique pour les liens d''invitation';

-- =============================================
-- 3. Fonction helper pour vérifier l'accès équipe
-- =============================================
CREATE OR REPLACE FUNCTION user_has_team_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = auth.uid()
      AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. RLS pour teams
-- =============================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their teams" ON teams
  FOR SELECT USING (user_has_team_access(id) OR owner_id = auth.uid());

CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update teams" ON teams
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete teams" ON teams
  FOR DELETE USING (owner_id = auth.uid());

-- =============================================
-- 5. RLS pour team_members
-- =============================================
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view members" ON team_members
  FOR SELECT USING (user_has_team_access(team_id));

CREATE POLICY "Admins can manage members" ON team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'accepted'
    )
  );

-- =============================================
-- 6. Ajouter team_id aux tables existantes
-- =============================================

-- WhatsApp Sessions
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_team ON whatsapp_sessions(team_id) WHERE team_id IS NOT NULL;

-- AI Agents
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agents_team ON ai_agents(team_id) WHERE team_id IS NOT NULL;

-- Knowledge Documents
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_team ON knowledge_documents(team_id) WHERE team_id IS NOT NULL;

-- WA Links
ALTER TABLE wa_links
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wa_links_team ON wa_links(team_id) WHERE team_id IS NOT NULL;

-- Conversation Tags
ALTER TABLE conversation_tags
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conv_tags_team ON conversation_tags(team_id) WHERE team_id IS NOT NULL;

-- =============================================
-- 7. Mettre à jour les RLS existantes pour supporter les équipes
-- =============================================

-- Sessions: Ajouter accès équipe
DROP POLICY IF EXISTS "Users can view own sessions" ON whatsapp_sessions;
CREATE POLICY "Users can view sessions" ON whatsapp_sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can manage own sessions" ON whatsapp_sessions;
CREATE POLICY "Users can manage sessions" ON whatsapp_sessions
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- Agents: Ajouter accès équipe
DROP POLICY IF EXISTS "Users can view own agents" ON ai_agents;
CREATE POLICY "Users can view agents" ON ai_agents
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can manage own agents" ON ai_agents;
CREATE POLICY "Users can manage agents" ON ai_agents
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can delete own agents" ON ai_agents;
CREATE POLICY "Users can delete agents" ON ai_agents
  FOR DELETE USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- Knowledge Documents: Ajouter accès équipe
DROP POLICY IF EXISTS "Users can view own documents" ON knowledge_documents;
CREATE POLICY "Users can view documents" ON knowledge_documents
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can manage own documents" ON knowledge_documents;
CREATE POLICY "Users can manage documents" ON knowledge_documents
  FOR ALL USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- WA Links: Ajouter accès équipe
DROP POLICY IF EXISTS "Users can view own links" ON wa_links;
CREATE POLICY "Users can view links" ON wa_links
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can manage own links" ON wa_links;
CREATE POLICY "Users can manage links" ON wa_links
  FOR ALL USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- Conversation Tags: Ajouter accès équipe
DROP POLICY IF EXISTS "Users can view own tags" ON conversation_tags;
CREATE POLICY "Users can view tags" ON conversation_tags
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

DROP POLICY IF EXISTS "Users can manage own tags" ON conversation_tags;
CREATE POLICY "Users can manage tags" ON conversation_tags
  FOR ALL USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- =============================================
-- 8. Trigger pour créer automatiquement le membre owner lors de la création d'équipe
-- =============================================
CREATE OR REPLACE FUNCTION create_team_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'accepted');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_team_created ON teams;
CREATE TRIGGER on_team_created
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION create_team_owner_member();
