-- Migration: Security Audit v2 — Fix ALL RLS issues including anon access leak
-- Date: 2026-03-05
-- CRITICAL: Multiple tables are accessible by the anon role because policies
-- were created TO PUBLIC (default) instead of TO authenticated.
-- This migration drops ALL old policies and recreates them with TO authenticated.

-- =============================================
-- 0. CRITICAL FIX: Drop ALL old policies on leaking tables and recreate TO authenticated
-- Tables leaking to anon: whatsapp_sessions, ai_agents, wa_links,
-- contacts, conversations, knowledge_documents, knowledge_chunks
-- =============================================

-- =============================================
-- 0a. whatsapp_sessions — DROP all old policies, recreate TO authenticated
-- =============================================
DROP POLICY IF EXISTS "Users can view own sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can manage own sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can view sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can manage sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON whatsapp_sessions;

CREATE POLICY "Users can view sessions" ON whatsapp_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can update sessions" ON whatsapp_sessions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert sessions" ON whatsapp_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete sessions" ON whatsapp_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 0b. ai_agents — DROP all old, recreate TO authenticated
-- =============================================
DROP POLICY IF EXISTS "Users can view own agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can manage own agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can view agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can manage agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can delete agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can update agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can insert agents" ON ai_agents;

CREATE POLICY "Users can view agents" ON ai_agents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert agents" ON ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update agents" ON ai_agents
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can delete agents" ON ai_agents
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- =============================================
-- 0c. contacts — DROP all old, recreate TO authenticated with granular perms
-- =============================================
DROP POLICY IF EXISTS "Users can view contacts of own sessions" ON contacts;
DROP POLICY IF EXISTS "Users can manage contacts of own sessions" ON contacts;
DROP POLICY IF EXISTS "Users can view contacts of sessions" ON contacts;
DROP POLICY IF EXISTS "Users can manage contacts of sessions" ON contacts;
DROP POLICY IF EXISTS "Users can view contacts for sessions" ON contacts;
DROP POLICY IF EXISTS "Users can insert contacts for sessions" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts for sessions" ON contacts;
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;

CREATE POLICY "Users can view contacts" ON contacts
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can insert contacts" ON contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can update contacts" ON contacts
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can delete contacts" ON contacts
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 0d. conversations — DROP all old, recreate TO authenticated with granular perms
-- =============================================
DROP POLICY IF EXISTS "Users can view conversations of own sessions" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations of own sessions" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations of sessions" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations of sessions" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations for sessions" ON conversations;
DROP POLICY IF EXISTS "Users can insert conversations for sessions" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations for sessions" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations for sessions" ON conversations;

CREATE POLICY "Users can view conversations" ON conversations
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
      ))
    )
  );

CREATE POLICY "Users can insert conversations" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
      ))
    )
  );

CREATE POLICY "Users can update conversations" ON conversations
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
      ))
    )
  );

CREATE POLICY "Users can delete conversations" ON conversations
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 0e. messages — DROP all old, recreate TO authenticated with granular perms
-- =============================================
DROP POLICY IF EXISTS "Users can view messages of own sessions" ON messages;
DROP POLICY IF EXISTS "Users can insert messages for own sessions" ON messages;
DROP POLICY IF EXISTS "Users can view messages of sessions" ON messages;
DROP POLICY IF EXISTS "Users can insert messages for sessions" ON messages;
DROP POLICY IF EXISTS "Users can update messages for sessions" ON messages;
DROP POLICY IF EXISTS "Users can view messages for sessions" ON messages;
DROP POLICY IF EXISTS "Users can delete messages" ON messages;

CREATE POLICY "Users can view messages" ON messages
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
      ))
    )
  );

CREATE POLICY "Users can insert messages" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
      ))
    )
  );

CREATE POLICY "Users can update messages" ON messages
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
      ))
    )
  );

CREATE POLICY "Users can delete messages" ON messages
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 0f. knowledge_documents — DROP all old, recreate TO authenticated
-- =============================================
DROP POLICY IF EXISTS "Users can view own documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can update own documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can view documents" ON knowledge_documents;

CREATE POLICY "Users can view documents" ON knowledge_documents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert documents" ON knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update documents" ON knowledge_documents
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can delete documents" ON knowledge_documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 1. FIX profiles SELECT — CRITICAL
-- =============================================
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own and team profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view own and team profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT tm2.user_id FROM team_members tm
      JOIN team_members tm2 ON tm2.team_id = tm.team_id AND tm2.status = 'accepted'
      WHERE tm.user_id = auth.uid() AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- =============================================
-- 2. FIX booking_proposals — CRITICAL
-- =============================================
DROP POLICY IF EXISTS "Service can insert proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Service can update proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Users can view booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Users can insert booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Users can update booking proposals" ON booking_proposals;

CREATE POLICY "Users can view booking proposals" ON booking_proposals
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can insert booking proposals" ON booking_proposals
  FOR INSERT TO authenticated
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

CREATE POLICY "Users can update booking proposals" ON booking_proposals
  FOR UPDATE TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

-- =============================================
-- 3. FIX link_clicks — HIGH
-- =============================================
DROP POLICY IF EXISTS "Users can view link clicks" ON link_clicks;
DROP POLICY IF EXISTS "Users can delete link clicks" ON link_clicks;
-- Revoke anon access that was granted in migration_link_clicks.sql
REVOKE ALL ON link_clicks FROM anon;

CREATE POLICY "Users can view link clicks" ON link_clicks
  FOR SELECT TO authenticated
  USING (
    link_id IN (
      SELECT id FROM wa_links
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can delete link clicks" ON link_clicks
  FOR DELETE TO authenticated
  USING (
    link_id IN (
      SELECT id FROM wa_links WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 4. FIX stats_daily — HIGH
-- =============================================
DROP POLICY IF EXISTS "Users can view own stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can view stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can insert own stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can update own stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can delete own stats" ON stats_daily;

CREATE POLICY "Users can view stats" ON stats_daily
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      session_id IN (
        SELECT ws.id FROM whatsapp_sessions ws
        WHERE ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = auth.uid()
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_stats = true)
        )
      )
    )
  );

CREATE POLICY "Users can insert stats" ON stats_daily
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update stats" ON stats_daily
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete stats" ON stats_daily
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 5. FIX wa_links — split FOR ALL into granular
-- =============================================
DROP POLICY IF EXISTS "Users can manage links" ON wa_links;
DROP POLICY IF EXISTS "Users can manage own links" ON wa_links;
DROP POLICY IF EXISTS "Users can view links" ON wa_links;
DROP POLICY IF EXISTS "Users can view own links" ON wa_links;
DROP POLICY IF EXISTS "Users can update links" ON wa_links;
DROP POLICY IF EXISTS "Users can insert links" ON wa_links;
DROP POLICY IF EXISTS "Users can delete links" ON wa_links;
DROP POLICY IF EXISTS "Users can delete own links" ON wa_links;

CREATE POLICY "Users can view links" ON wa_links
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    ))
  );

CREATE POLICY "Users can insert links" ON wa_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update links" ON wa_links
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = wa_links.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'accepted'
      AND (tm.role IN ('owner', 'admin') OR tm.can_manage_links = true)
    ))
  );

CREATE POLICY "Users can delete links" ON wa_links
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 6. FIX agent_tools / tool_execution_logs
-- =============================================
DROP POLICY IF EXISTS "Users can view own tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can view tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can insert own tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can insert tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can update own tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can update tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can delete own tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can delete tools" ON agent_tools;

CREATE POLICY "Users can view tools" ON agent_tools
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can insert tools" ON agent_tools
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update tools" ON agent_tools
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can delete tools" ON agent_tools
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- tool_execution_logs
DROP POLICY IF EXISTS "Users can view own tool logs" ON tool_execution_logs;
DROP POLICY IF EXISTS "Users can view tool logs" ON tool_execution_logs;
DROP POLICY IF EXISTS "Users can insert own tool logs" ON tool_execution_logs;
DROP POLICY IF EXISTS "Users can insert tool logs" ON tool_execution_logs;

CREATE POLICY "Users can view tool logs" ON tool_execution_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can insert tool logs" ON tool_execution_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- 7. FIX conversation_tags / conversation_tag_assignments
-- =============================================
DROP POLICY IF EXISTS "Users can view own tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can view tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can create own tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can create tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can update own tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can update tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can delete own tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can delete tags" ON conversation_tags;

CREATE POLICY "Users can view tags" ON conversation_tags
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT tm2.user_id FROM team_members tm
      JOIN team_members tm2 ON tm2.team_id = tm.team_id AND tm2.status = 'accepted'
      WHERE tm.user_id = auth.uid() AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can create tags" ON conversation_tags
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update tags" ON conversation_tags
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete tags" ON conversation_tags
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- conversation_tag_assignments
DROP POLICY IF EXISTS "Users can view tag assignments" ON conversation_tag_assignments;
DROP POLICY IF EXISTS "Users can view own tag assignments" ON conversation_tag_assignments;
DROP POLICY IF EXISTS "Users can insert tag assignments" ON conversation_tag_assignments;
DROP POLICY IF EXISTS "Users can delete tag assignments" ON conversation_tag_assignments;

CREATE POLICY "Users can view tag assignments" ON conversation_tag_assignments
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE ws.user_id = auth.uid()
      OR (ws.team_id IS NOT NULL AND ws.team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
      ))
    )
  );

-- Keep existing INSERT/DELETE policies (they already check ownership)

-- =============================================
-- 8. FIX knowledge_chunks
-- =============================================
DROP POLICY IF EXISTS "Users can view own chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Users can view chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Users can insert own chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Users can delete own chunks" ON knowledge_chunks;

CREATE POLICY "Users can view chunks" ON knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR document_id IN (
      SELECT id FROM knowledge_documents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = auth.uid() AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_view_knowledge = true)
      )
    )
  );

CREATE POLICY "Users can insert chunks" ON knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete chunks" ON knowledge_chunks
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 9. FIX team_invitations — enforce expiry in RLS
-- =============================================
DROP POLICY IF EXISTS "Anyone can view valid invitations" ON team_invitations;
DROP POLICY IF EXISTS "Public can view valid invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can view team invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can insert invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON team_invitations;

-- Admin policies TO authenticated
CREATE POLICY "Admins can view team invitations" ON team_invitations
  FOR SELECT TO authenticated
  USING (is_team_admin(team_id));

CREATE POLICY "Admins can insert invitations" ON team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_team_admin(team_id));

CREATE POLICY "Admins can delete invitations" ON team_invitations
  FOR DELETE TO authenticated
  USING (is_team_admin(team_id) AND used_by IS NULL);

CREATE POLICY "Admins can update invitations" ON team_invitations
  FOR UPDATE TO authenticated
  USING (is_team_admin(team_id));

-- Public lookup: only unused, non-expired invitations (for join page)
-- This is intentionally TO PUBLIC so unauthenticated users can view invitation details
CREATE POLICY "Public can view valid invitations" ON team_invitations
  FOR SELECT
  USING (
    used_by IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

-- =============================================
-- 10. FIX campaign_recipients — ensure TO authenticated + cleanup
-- =============================================
DROP POLICY IF EXISTS "Users can delete campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can view campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can view own campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can insert own campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can update own campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can delete own campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Service can manage recipients" ON campaign_recipients;

CREATE POLICY "Users can view campaign recipients" ON campaign_recipients
  FOR SELECT TO authenticated
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

CREATE POLICY "Users can insert campaign recipients" ON campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update campaign recipients" ON campaign_recipients
  FOR UPDATE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete campaign recipients" ON campaign_recipients
  FOR DELETE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 11. FIX booking_link_clicks — ensure TO authenticated
-- =============================================
DROP POLICY IF EXISTS "Users can insert booking clicks for own agents" ON booking_link_clicks;
DROP POLICY IF EXISTS "Service can insert booking clicks" ON booking_link_clicks;

CREATE POLICY "Users can insert booking clicks" ON booking_link_clicks
  FOR INSERT TO authenticated
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

-- =============================================
-- 12. Ensure remaining tables also use TO authenticated
-- =============================================

-- teams
DROP POLICY IF EXISTS "Team members can view team" ON teams;
DROP POLICY IF EXISTS "Owner can manage team" ON teams;
DROP POLICY IF EXISTS "Owner can insert team" ON teams;
DROP POLICY IF EXISTS "Owner can update team" ON teams;
DROP POLICY IF EXISTS "Owner can delete team" ON teams;

CREATE POLICY "Users can view teams" ON teams
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR user_has_team_access(id)
  );

CREATE POLICY "Users can insert teams" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update teams" ON teams
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete teams" ON teams
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- campaigns
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view campaigns" ON campaigns;

CREATE POLICY "Users can view campaigns" ON campaigns
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    ))
  );

CREATE POLICY "Users can manage campaigns" ON campaigns
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- webhook_logs
DROP POLICY IF EXISTS "Users can view webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "Users can delete webhook logs" ON webhook_logs;

CREATE POLICY "Users can view webhook logs" ON webhook_logs
  FOR SELECT TO authenticated
  USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

CREATE POLICY "Users can delete webhook logs" ON webhook_logs
  FOR DELETE TO authenticated
  USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- payment_history
DROP POLICY IF EXISTS "Users can view own payment history" ON payment_history;

CREATE POLICY "Users can view payment history" ON payment_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- VERIFICATION: Run after migration
-- =============================================
-- Check no policies are TO PUBLIC (except team_invitations public lookup):
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE schemaname = 'public' AND '{public}' = ANY(ARRAY[roles::text[]])
-- ORDER BY tablename;
