-- ============================================================================
-- Migration: Fix multiple_permissive_policies warnings
-- Merge duplicate policies on team_invitations and team_members
-- ============================================================================

-- ============================================================================
-- SECTION 1: team_invitations - Fix duplicate policies
-- ============================================================================

-- 1.1 DELETE: "Admins can delete invitations" + "Admins can delete unused invitations"
-- Drop both, keep one merged policy
DROP POLICY IF EXISTS "Admins can delete invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can delete unused invitations" ON team_invitations;

CREATE POLICY "Admins can delete invitations" ON team_invitations
  FOR DELETE TO authenticated
  USING (is_team_admin(team_id) AND used_by IS NULL);

-- 1.2 INSERT: "Admins can create invitations" + "Admins can insert invitations"
-- Drop both, keep one
DROP POLICY IF EXISTS "Admins can create invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can insert invitations" ON team_invitations;

CREATE POLICY "Admins can insert invitations" ON team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id));

-- 1.3 SELECT: "Admins can view team invitations" + "Authenticated can view valid invitations"
-- These serve different purposes but cause duplicate warning.
-- Merge into one: admins see all their team's invitations, others see only valid unused ones
DROP POLICY IF EXISTS "Admins can view team invitations" ON team_invitations;
DROP POLICY IF EXISTS "Authenticated can view valid invitations" ON team_invitations;

CREATE POLICY "Users can view invitations" ON team_invitations
  FOR SELECT TO authenticated
  USING (
    is_team_admin(team_id)
    OR (
      used_by IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- ============================================================================
-- SECTION 2: team_members - Fix duplicate policies + add TO authenticated
-- ============================================================================

-- 2.1 DELETE: "Admins can remove members" + "Users can leave team"
-- Merge into one policy: admin can remove non-owners, users can remove themselves
DROP POLICY IF EXISTS "Admins can remove members" ON team_members;
DROP POLICY IF EXISTS "Users can leave team" ON team_members;

CREATE POLICY "Users can delete members" ON team_members
  FOR DELETE TO authenticated
  USING (
    role != 'owner'
    AND (
      user_id = (select auth.uid())
      OR is_team_admin(team_id)
    )
  );

-- 2.2 UPDATE: "Admins can update members" + "Users can accept own invitation"
-- Merge into one policy
DROP POLICY IF EXISTS "Admins can update members" ON team_members;
DROP POLICY IF EXISTS "Users can accept own invitation" ON team_members;

CREATE POLICY "Users can update members" ON team_members
  FOR UPDATE TO authenticated
  USING (
    -- Admin can update any member (except demoting themselves if owner)
    (is_team_admin(team_id) AND NOT (role = 'owner' AND user_id = (select auth.uid())))
    OR
    -- User can accept their own pending invitation
    (user_id = (select auth.uid()) AND status = 'pending')
  );

-- 2.3 SELECT: "Members can view team members" + "Authenticated can view pending invitation by token"
-- Merge into one policy
DROP POLICY IF EXISTS "Members can view team members" ON team_members;
DROP POLICY IF EXISTS "Authenticated can view pending invitation by token" ON team_members;

CREATE POLICY "Users can view members" ON team_members
  FOR SELECT TO authenticated
  USING (
    is_team_member(team_id)
    OR (
      invitation_token IS NOT NULL
      AND status = 'pending'
      AND user_id IS NULL
    )
  );
