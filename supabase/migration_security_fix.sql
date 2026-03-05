-- Migration: Fix RLS Security Issues
-- Date: 2026-03-05
-- Fixes:
--   1. CRITICAL: campaign_recipients USING(true) → scope to campaign owner/team
--   2. HIGH: booking_link_clicks INSERT WITH CHECK(true) → scope to agent owner/team
--   3. HIGH: Enforce granular team permissions in RLS for messages, conversations, contacts

-- =============================================
-- 1. FIX campaign_recipients - CRITICAL
-- =============================================
-- Before: USING(true) = any authenticated user can read/modify ALL recipients
-- After: Only campaign owner or team member can access recipients

DROP POLICY IF EXISTS "Service can manage recipients" ON campaign_recipients;

-- SELECT: owner or team member of the campaign
CREATE POLICY "Users can view own campaign recipients" ON campaign_recipients
  FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

-- INSERT: only campaign owner (not team members - only owner creates recipients)
CREATE POLICY "Users can insert own campaign recipients" ON campaign_recipients
  FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- UPDATE: only campaign owner
CREATE POLICY "Users can update own campaign recipients" ON campaign_recipients
  FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- DELETE: only campaign owner
CREATE POLICY "Users can delete own campaign recipients" ON campaign_recipients
  FOR DELETE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- Service role (used by campaign executor) bypasses RLS automatically
-- No special policy needed for service_role

-- =============================================
-- 2. FIX booking_link_clicks INSERT - HIGH
-- =============================================
-- Before: WITH CHECK(true) = any authenticated user can insert fake clicks
-- After: Only via service role (public booking endpoint uses service role)
-- Authenticated users can only insert for their own agents

DROP POLICY IF EXISTS "Service can insert booking clicks" ON booking_link_clicks;

-- Restrict INSERT to clicks for agents the user owns or is team member of
CREATE POLICY "Users can insert booking clicks for own agents" ON booking_link_clicks
  FOR INSERT
  WITH CHECK (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

-- Note: The public booking endpoint (/api/booking/[agentId]) uses service_role
-- which bypasses RLS, so public clicks still work fine

-- =============================================
-- 3. ENFORCE granular team permissions in RLS
-- =============================================
-- Currently: team members can access ALL data if they're in the team
-- After: team members need specific permissions (can_view_messages, etc.)

-- 3a. Messages SELECT - enforce can_view_messages
DROP POLICY IF EXISTS "Users can view messages of sessions" ON messages;
DROP POLICY IF EXISTS "Users can view messages for sessions" ON messages;

CREATE POLICY "Users can view messages for sessions" ON messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
        )
      )
    )
  );

-- 3b. Messages INSERT - enforce can_send_messages
DROP POLICY IF EXISTS "Users can insert messages for sessions" ON messages;

CREATE POLICY "Users can insert messages for sessions" ON messages
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
        )
      )
    )
  );

-- 3c. Messages UPDATE - enforce can_send_messages (for status updates)
DROP POLICY IF EXISTS "Users can update messages for sessions" ON messages;

CREATE POLICY "Users can update messages for sessions" ON messages
  FOR UPDATE
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
        )
      )
    )
  );

-- 3d. Conversations - replace FOR ALL with granular policies
DROP POLICY IF EXISTS "Users can view conversations of sessions" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations for sessions" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations of sessions" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations for sessions" ON conversations;

CREATE POLICY "Users can view conversations for sessions" ON conversations
  FOR SELECT
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
        )
      )
    )
  );

-- Conversations UPDATE (for marking read, pinning, assigning agent, etc.)
CREATE POLICY "Users can update conversations for sessions" ON conversations
  FOR UPDATE
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
        )
      )
    )
  );

-- Conversations INSERT (new conversation from contact)
CREATE POLICY "Users can insert conversations for sessions" ON conversations
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
        )
      )
    )
  );

-- 3e. Contacts - replace FOR ALL with granular policies
DROP POLICY IF EXISTS "Users can view contacts of sessions" ON contacts;
DROP POLICY IF EXISTS "Users can view contacts for sessions" ON contacts;
DROP POLICY IF EXISTS "Users can manage contacts of sessions" ON contacts;
DROP POLICY IF EXISTS "Users can manage contacts for sessions" ON contacts;

CREATE POLICY "Users can view contacts for sessions" ON contacts
  FOR SELECT
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
        )
      )
    )
  );

-- Contacts INSERT (webhook creates contacts via service_role, but users may also create)
CREATE POLICY "Users can insert contacts for sessions" ON contacts
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
        )
      )
    )
  );

-- Contacts UPDATE (edit contact name, etc.)
CREATE POLICY "Users can update contacts for sessions" ON contacts
  FOR UPDATE
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (
        ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
        )
      )
    )
  );

-- =============================================
-- 4. ENCRYPT WABA access token
-- =============================================
-- Note: This is handled in application code (process-ai-response.ts, sessions/route.ts)
-- The waba_access_token column should be encrypted before INSERT
-- See recommendation below for code changes

-- =============================================
-- VERIFICATION QUERIES (run after migration)
-- =============================================
-- Copy-paste these in SQL Editor to verify:

-- Check campaign_recipients policies:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'campaign_recipients';

-- Check booking_link_clicks policies:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'booking_link_clicks';

-- Check messages policies:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'messages';

-- Check conversations policies:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'conversations';

-- Check contacts policies:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'contacts';
