-- Migration: Correction du système de code d'invitation
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Fonction SECURITY DEFINER pour rejoindre via code
-- Cette fonction contourne les RLS pour permettre à un utilisateur
-- de s'ajouter comme membre et marquer l'invitation comme utilisée
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

  -- Ajouter comme membre avec les permissions
  INSERT INTO team_members (
    team_id,
    user_id,
    role,
    status,
    allowed_session_ids,
    allowed_agent_ids,
    allowed_link_ids
  ) VALUES (
    v_invitation.team_id,
    v_user_id,
    v_invitation.role,
    'accepted',
    v_invitation.allowed_session_ids,
    v_invitation.allowed_agent_ids,
    v_invitation.allowed_link_ids
  );

  -- Marquer l'invitation comme utilisée
  UPDATE team_invitations
  SET used_by = v_user_id,
      used_at = NOW()
  WHERE id = v_invitation.id;

  -- Retourner le succès
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'team', json_build_object('id', v_team.id, 'name', v_team.name),
      'role', v_invitation.role,
      'permissions', json_build_object(
        'sessions', v_invitation.allowed_session_ids,
        'agents', v_invitation.allowed_agent_ids,
        'links', v_invitation.allowed_link_ids
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. Accorder les droits d'exécution
-- =============================================
GRANT EXECUTE ON FUNCTION join_team_with_code(TEXT) TO authenticated;

COMMENT ON FUNCTION join_team_with_code IS 'Permet à un utilisateur de rejoindre une équipe via code d''invitation. Contourne les RLS de manière sécurisée.';
