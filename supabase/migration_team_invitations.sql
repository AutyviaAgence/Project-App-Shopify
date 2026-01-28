-- Migration: Système d'invitations avec permissions granulaires
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Table des invitations d'équipe
-- =============================================
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),

  -- Permissions granulaires (NULL = aucun accès, tableau vide = aucun, tableau avec IDs = accès limité)
  allowed_session_ids UUID[] DEFAULT NULL,
  allowed_agent_ids UUID[] DEFAULT NULL,
  allowed_link_ids UUID[] DEFAULT NULL,

  -- Métadonnées
  created_by UUID NOT NULL REFERENCES profiles(id),
  used_by UUID REFERENCES profiles(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_code ON team_invitations(code);
CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON team_invitations(team_id);

COMMENT ON TABLE team_invitations IS 'Codes d''invitation avec permissions granulaires';
COMMENT ON COLUMN team_invitations.allowed_session_ids IS 'Sessions WhatsApp autorisées (NULL = toutes, [] = aucune)';
COMMENT ON COLUMN team_invitations.allowed_agent_ids IS 'Agents IA autorisés';
COMMENT ON COLUMN team_invitations.allowed_link_ids IS 'Liens WhatsApp autorisés';

-- =============================================
-- 2. Table des permissions membres (stocke les accès après jonction)
-- =============================================
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS allowed_session_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_agent_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_link_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN team_members.allowed_session_ids IS 'Sessions autorisées pour ce membre (NULL = toutes du team)';

-- =============================================
-- 3. Fonction pour générer un code unique
-- =============================================
CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. RLS pour team_invitations
-- =============================================
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies existantes si elles existent
DROP POLICY IF EXISTS "Admins can view team invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can delete unused invitations" ON team_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by code" ON team_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON team_invitations;

-- Les admins/owners peuvent voir les invitations de leur équipe
CREATE POLICY "Admins can view team invitations" ON team_invitations
  FOR SELECT USING (is_team_admin(team_id));

-- Les admins/owners peuvent créer des invitations
CREATE POLICY "Admins can create invitations" ON team_invitations
  FOR INSERT WITH CHECK (is_team_admin(team_id));

-- Les admins/owners peuvent supprimer des invitations non utilisées
CREATE POLICY "Admins can delete unused invitations" ON team_invitations
  FOR DELETE USING (is_team_admin(team_id) AND used_by IS NULL);

-- Les admins/owners peuvent mettre à jour les invitations (pour marquer used_by)
CREATE POLICY "Admins can update invitations" ON team_invitations
  FOR UPDATE USING (is_team_admin(team_id));

-- Tout le monde peut voir une invitation par son code (pour rejoindre)
CREATE POLICY "Anyone can view invitation by code" ON team_invitations
  FOR SELECT USING (used_by IS NULL AND (expires_at IS NULL OR expires_at > NOW()));

-- =============================================
-- 5. Fonction helper pour vérifier l'accès à une session
-- =============================================
CREATE OR REPLACE FUNCTION user_can_access_session(p_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_owner UUID;
  v_session_team UUID;
  v_member_permissions UUID[];
BEGIN
  -- Vérifier si l'utilisateur est le propriétaire de la session
  SELECT user_id, team_id INTO v_session_owner, v_session_team
  FROM whatsapp_sessions WHERE id = p_session_id;

  IF v_session_owner = v_user_id THEN
    RETURN TRUE;
  END IF;

  -- Vérifier si l'utilisateur a accès via une équipe
  IF v_session_team IS NOT NULL THEN
    SELECT allowed_session_ids INTO v_member_permissions
    FROM team_members
    WHERE team_id = v_session_team
      AND user_id = v_user_id
      AND status = 'accepted';

    IF FOUND THEN
      -- NULL = accès à toutes les sessions de l'équipe
      IF v_member_permissions IS NULL THEN
        RETURN TRUE;
      END IF;
      -- Sinon, vérifier si la session est dans la liste
      RETURN p_session_id = ANY(v_member_permissions);
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
