-- Fix: Résoudre la récursion infinie dans les politiques RLS de team_members
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 0. Ajouter la colonne invited_email si elle n'existe pas
-- =============================================
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_email TEXT;

-- =============================================
-- 1. Supprimer TOUTES les anciennes politiques
-- =============================================
DROP POLICY IF EXISTS "Team members can view members" ON team_members;
DROP POLICY IF EXISTS "Admins can manage members" ON team_members;
DROP POLICY IF EXISTS "Members can view team members" ON team_members;
DROP POLICY IF EXISTS "Admins can invite members" ON team_members;
DROP POLICY IF EXISTS "Admins can update members" ON team_members;
DROP POLICY IF EXISTS "Admins can remove members" ON team_members;
DROP POLICY IF EXISTS "Users can accept own invitation" ON team_members;
DROP POLICY IF EXISTS "Users can leave team" ON team_members;
DROP POLICY IF EXISTS "Anyone can view pending invitation by token" ON team_members;

-- =============================================
-- 2. Créer une fonction helper SECURITY DEFINER pour éviter la récursion
-- =============================================
CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
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
-- 3. Recréer les politiques RLS sans récursion
-- =============================================

-- SELECT: Les membres peuvent voir les autres membres de leur équipe
CREATE POLICY "Members can view team members" ON team_members
  FOR SELECT USING (is_team_member(team_id));

-- INSERT: Les admins peuvent inviter des membres
CREATE POLICY "Admins can invite members" ON team_members
  FOR INSERT WITH CHECK (
    is_team_admin(team_id)
    OR (
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (SELECT 1 FROM teams WHERE id = team_id AND owner_id = auth.uid())
    )
  );

-- UPDATE: Les admins peuvent modifier les membres
CREATE POLICY "Admins can update members" ON team_members
  FOR UPDATE USING (
    is_team_admin(team_id)
    AND NOT (role = 'owner' AND user_id = auth.uid())
  );

-- DELETE: Les admins peuvent retirer des membres (sauf le owner)
CREATE POLICY "Admins can remove members" ON team_members
  FOR DELETE USING (
    is_team_admin(team_id)
    AND role != 'owner'
  );

-- Cas spécial: Un utilisateur peut accepter sa propre invitation
CREATE POLICY "Users can accept own invitation" ON team_members
  FOR UPDATE USING (
    user_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'accepted'
  );

-- Cas spécial: Un utilisateur peut quitter une équipe (sauf owner)
CREATE POLICY "Users can leave team" ON team_members
  FOR DELETE USING (
    user_id = auth.uid()
    AND role != 'owner'
  );

-- =============================================
-- 4. Mettre à jour user_has_team_access
-- =============================================
CREATE OR REPLACE FUNCTION user_has_team_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_team_member(p_team_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. Politique pour les invitations par token
-- =============================================
CREATE POLICY "Anyone can view pending invitation by token" ON team_members
  FOR SELECT USING (
    invitation_token IS NOT NULL
    AND status = 'pending'
    AND user_id IS NULL
  );

-- =============================================
-- 6. Recréer le trigger avec SECURITY DEFINER
-- =============================================
CREATE OR REPLACE FUNCTION create_team_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'accepted');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_team_created ON teams;
CREATE TRIGGER on_team_created
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION create_team_owner_member();
