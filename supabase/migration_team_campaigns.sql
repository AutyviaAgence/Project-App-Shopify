-- Migration: Ajouter les permissions de campagnes aux équipes
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Ajouter la colonne allowed_campaign_ids à team_invitations
-- =============================================
ALTER TABLE team_invitations
  ADD COLUMN IF NOT EXISTS allowed_campaign_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN team_invitations.allowed_campaign_ids IS 'Campagnes autorisées (NULL = toutes, [] = aucune)';

-- =============================================
-- 2. Ajouter la colonne allowed_campaign_ids à team_members
-- =============================================
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS allowed_campaign_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN team_members.allowed_campaign_ids IS 'Campagnes autorisées pour ce membre (NULL = toutes du team)';

-- =============================================
-- 3. Fonction helper pour vérifier l'accès à une campagne
-- =============================================
CREATE OR REPLACE FUNCTION user_can_access_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_campaign_owner UUID;
  v_campaign_team UUID;
  v_member_permissions UUID[];
BEGIN
  -- Vérifier si l'utilisateur est le propriétaire de la campagne
  SELECT user_id, team_id INTO v_campaign_owner, v_campaign_team
  FROM campaigns WHERE id = p_campaign_id;

  IF v_campaign_owner = v_user_id THEN
    RETURN TRUE;
  END IF;

  -- Vérifier si l'utilisateur a accès via une équipe
  IF v_campaign_team IS NOT NULL THEN
    SELECT allowed_campaign_ids INTO v_member_permissions
    FROM team_members
    WHERE team_id = v_campaign_team
      AND user_id = v_user_id
      AND status = 'accepted';

    IF FOUND THEN
      -- NULL = accès à toutes les campagnes de l'équipe
      IF v_member_permissions IS NULL THEN
        RETURN TRUE;
      END IF;
      -- Sinon, vérifier si la campagne est dans la liste
      RETURN p_campaign_id = ANY(v_member_permissions);
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_can_access_campaign IS 'Vérifie si l''utilisateur peut accéder à une campagne (propriétaire ou membre d''équipe avec permission)';

-- =============================================
-- 4. Vérifier que campaigns a bien team_id
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_campaigns_team ON campaigns(team_id) WHERE team_id IS NOT NULL;
  END IF;
END $$;

-- =============================================
-- 5. RLS pour campaigns (mise à jour)
-- =============================================
-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view team campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage own campaigns" ON campaigns;

-- Permettre de voir ses propres campagnes et celles de l'équipe avec permission
CREATE POLICY "Users can view campaigns" ON campaigns
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_can_access_campaign(id)
  );

-- Permettre de créer des campagnes
CREATE POLICY "Users can create campaigns" ON campaigns
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Permettre de modifier/supprimer ses propres campagnes ou celles de l'équipe (admin)
CREATE POLICY "Users can update own campaigns" ON campaigns
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND is_team_admin(team_id))
  );

CREATE POLICY "Users can delete own campaigns" ON campaigns
  FOR DELETE USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND is_team_admin(team_id))
  );

-- =============================================
-- 6. Mise à jour de la fonction join_team_with_code pour supporter les campagnes
-- =============================================
CREATE OR REPLACE FUNCTION join_team_with_code(p_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invitation RECORD;
  v_team RECORD;
  v_existing_member RECORD;
  v_result JSON;
BEGIN
  -- Vérifier que l'utilisateur est authentifié
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Non authentifié', 'status', 401);
  END IF;

  -- Trouver l'invitation par code (en majuscules)
  SELECT * INTO v_invitation
  FROM team_invitations
  WHERE code = UPPER(TRIM(p_code))
    AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Code invalide ou expiré', 'status', 404);
  END IF;

  -- Récupérer l'équipe
  SELECT id, name INTO v_team
  FROM teams
  WHERE id = v_invitation.team_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Équipe introuvable', 'status', 404);
  END IF;

  -- Vérifier si déjà membre
  SELECT id INTO v_existing_member
  FROM team_members
  WHERE team_id = v_invitation.team_id
    AND user_id = v_user_id
    AND status = 'accepted';

  IF FOUND THEN
    RETURN json_build_object('error', 'Vous êtes déjà membre de cette équipe', 'status', 409);
  END IF;

  -- Ajouter comme membre avec les permissions (incluant campagnes)
  INSERT INTO team_members (
    team_id,
    user_id,
    role,
    status,
    allowed_session_ids,
    allowed_agent_ids,
    allowed_link_ids,
    allowed_campaign_ids
  ) VALUES (
    v_invitation.team_id,
    v_user_id,
    v_invitation.role,
    'accepted',
    v_invitation.allowed_session_ids,
    v_invitation.allowed_agent_ids,
    v_invitation.allowed_link_ids,
    v_invitation.allowed_campaign_ids
  );

  -- Marquer l'invitation comme utilisée
  UPDATE team_invitations
  SET used_by = v_user_id,
      used_at = NOW()
  WHERE id = v_invitation.id;

  -- Retourner le succès avec les permissions de campagnes
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'team', json_build_object('id', v_team.id, 'name', v_team.name),
      'role', v_invitation.role,
      'permissions', json_build_object(
        'sessions', v_invitation.allowed_session_ids,
        'agents', v_invitation.allowed_agent_ids,
        'links', v_invitation.allowed_link_ids,
        'campaigns', v_invitation.allowed_campaign_ids
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION join_team_with_code IS 'Permet à un utilisateur de rejoindre une équipe via code d''invitation. Contourne les RLS de manière sécurisée. Supporte les permissions de campagnes.';
