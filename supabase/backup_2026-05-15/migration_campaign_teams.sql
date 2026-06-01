-- Migration: Support multi-équipes pour les campagnes
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Table de liaison pour les campagnes
-- =============================================

CREATE TABLE IF NOT EXISTS campaign_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_teams_campaign ON campaign_teams(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_teams_team ON campaign_teams(team_id);

-- Migrer les données existantes (team_id -> campaign_teams)
INSERT INTO campaign_teams (campaign_id, team_id)
SELECT id, team_id FROM campaigns WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 2. RLS pour campaign_teams
-- =============================================

ALTER TABLE campaign_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign_teams for their campaigns or teams" ON campaign_teams;
DROP POLICY IF EXISTS "Users can manage campaign_teams for their campaigns" ON campaign_teams;

CREATE POLICY "Users can view campaign_teams for their campaigns or teams"
  ON campaign_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_teams.campaign_id AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = campaign_teams.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can manage campaign_teams for their campaigns"
  ON campaign_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = campaign_teams.campaign_id AND c.user_id = auth.uid()
    )
  );

-- =============================================
-- 3. Fonction helper pour récupérer les équipes d'une campagne
-- =============================================

CREATE OR REPLACE FUNCTION get_campaign_team_ids(p_campaign_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM campaign_teams
  WHERE campaign_id = p_campaign_id;
$$ LANGUAGE SQL STABLE;

COMMENT ON TABLE campaign_teams IS 'Association campagnes <-> équipes (many-to-many)';
COMMENT ON FUNCTION get_campaign_team_ids IS 'Retourne les IDs des équipes associées à une campagne';

-- =============================================
-- 4. Mettre à jour user_can_access_campaign pour supporter multi-équipes
-- =============================================

CREATE OR REPLACE FUNCTION user_can_access_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_campaign_owner UUID;
  v_team_id UUID;
  v_member_permissions UUID[];
BEGIN
  -- Vérifier si l'utilisateur est le propriétaire de la campagne
  SELECT user_id INTO v_campaign_owner
  FROM campaigns WHERE id = p_campaign_id;

  IF v_campaign_owner = v_user_id THEN
    RETURN TRUE;
  END IF;

  -- Vérifier si l'utilisateur a accès via une des équipes associées
  FOR v_team_id IN
    SELECT team_id FROM campaign_teams WHERE campaign_id = p_campaign_id
  LOOP
    SELECT allowed_campaign_ids INTO v_member_permissions
    FROM team_members
    WHERE team_id = v_team_id
      AND user_id = v_user_id
      AND status = 'accepted';

    IF FOUND THEN
      -- NULL = accès à toutes les campagnes de l'équipe
      IF v_member_permissions IS NULL THEN
        RETURN TRUE;
      END IF;
      -- Sinon, vérifier si la campagne est dans la liste
      IF p_campaign_id = ANY(v_member_permissions) THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_can_access_campaign IS 'Vérifie si l''utilisateur peut accéder à une campagne (propriétaire ou membre d''une équipe associée avec permission)';
