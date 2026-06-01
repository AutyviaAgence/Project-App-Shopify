-- Migration: Permissions granulaires étendues (lecture/modification)
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Ajouter les nouvelles permissions à team_members
-- =============================================

-- Permissions de lecture/vision
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS can_view_stats BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_knowledge BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_messages BOOLEAN DEFAULT true;

-- Permissions de modification/gestion
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS can_manage_sessions BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_agents BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_knowledge BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_links BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_messages BOOLEAN DEFAULT true;

COMMENT ON COLUMN team_members.can_view_stats IS 'Peut voir les statistiques de l''équipe';
COMMENT ON COLUMN team_members.can_view_knowledge IS 'Peut voir la base de connaissances';
COMMENT ON COLUMN team_members.can_view_messages IS 'Peut voir les messages/conversations';
COMMENT ON COLUMN team_members.can_manage_sessions IS 'Peut modifier/configurer les sessions WhatsApp';
COMMENT ON COLUMN team_members.can_manage_agents IS 'Peut modifier les agents IA';
COMMENT ON COLUMN team_members.can_manage_knowledge IS 'Peut modifier la base de connaissances';
COMMENT ON COLUMN team_members.can_manage_links IS 'Peut modifier les liens WhatsApp';
COMMENT ON COLUMN team_members.can_send_messages IS 'Peut envoyer des messages';

-- =============================================
-- 2. Ajouter les mêmes permissions aux invitations
-- =============================================

ALTER TABLE team_invitations
  ADD COLUMN IF NOT EXISTS can_view_stats BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_knowledge BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_messages BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_sessions BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_agents BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_knowledge BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_links BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_messages BOOLEAN DEFAULT true;

-- =============================================
-- 3. Fonction pour vérifier une permission spécifique
-- =============================================
CREATE OR REPLACE FUNCTION user_has_team_permission(
  p_team_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_can_view_stats BOOLEAN;
  v_can_view_knowledge BOOLEAN;
  v_can_view_messages BOOLEAN;
  v_can_manage_sessions BOOLEAN;
  v_can_manage_agents BOOLEAN;
  v_can_manage_knowledge BOOLEAN;
  v_can_manage_links BOOLEAN;
  v_can_send_messages BOOLEAN;
BEGIN
  -- Récupérer le rôle et les permissions du membre
  SELECT
    role,
    COALESCE(can_view_stats, true),
    COALESCE(can_view_knowledge, true),
    COALESCE(can_view_messages, true),
    COALESCE(can_manage_sessions, false),
    COALESCE(can_manage_agents, false),
    COALESCE(can_manage_knowledge, false),
    COALESCE(can_manage_links, false),
    COALESCE(can_send_messages, true)
  INTO
    v_role,
    v_can_view_stats,
    v_can_view_knowledge,
    v_can_view_messages,
    v_can_manage_sessions,
    v_can_manage_agents,
    v_can_manage_knowledge,
    v_can_manage_links,
    v_can_send_messages
  FROM team_members
  WHERE team_id = p_team_id
    AND user_id = v_user_id
    AND status = 'accepted';

  -- Si pas membre, pas d'accès
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Owner et Admin ont toutes les permissions
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Pour les membres, vérifier la permission spécifique
  CASE p_permission
    WHEN 'stats_view' THEN RETURN v_can_view_stats;
    WHEN 'knowledge_view' THEN RETURN v_can_view_knowledge;
    WHEN 'messages_view' THEN RETURN v_can_view_messages;
    WHEN 'sessions_manage' THEN RETURN v_can_manage_sessions;
    WHEN 'agents_manage' THEN RETURN v_can_manage_agents;
    WHEN 'knowledge_manage' THEN RETURN v_can_manage_knowledge;
    WHEN 'links_manage' THEN RETURN v_can_manage_links;
    WHEN 'messages_send' THEN RETURN v_can_send_messages;
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_has_team_permission IS 'Vérifie si l''utilisateur a une permission spécifique dans une équipe';

-- =============================================
-- 4. Mettre à jour les admins/owners existants avec toutes les permissions
-- =============================================
UPDATE team_members
SET
  can_view_stats = true,
  can_view_knowledge = true,
  can_view_messages = true,
  can_manage_sessions = true,
  can_manage_agents = true,
  can_manage_knowledge = true,
  can_manage_links = true,
  can_send_messages = true
WHERE role IN ('owner', 'admin');

-- =============================================
-- 5. Mettre à jour les membres existants avec permissions de lecture par défaut
-- =============================================
UPDATE team_members
SET
  can_view_stats = true,
  can_view_knowledge = true,
  can_view_messages = true,
  can_manage_sessions = false,
  can_manage_agents = false,
  can_manage_knowledge = false,
  can_manage_links = false,
  can_send_messages = true
WHERE role = 'member' AND can_view_stats IS NULL;
