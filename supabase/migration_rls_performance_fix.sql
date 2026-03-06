-- Migration: RLS Performance Fix — Replace auth.uid() with (select auth.uid())
-- Date: 2026-03-06
-- Purpose: Wrap auth.uid() calls in (select ...) so Postgres evaluates them once
-- as an InitPlan instead of re-evaluating per row. This fixes all Supabase
-- Advisor "auth_rls_initplan" warnings.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- =============================================
-- 0. Fix helper functions — also use (select auth.uid())
-- =============================================
CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
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
      AND user_id = (select auth.uid())
      AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- user_has_team_access delegates to is_team_member (already fixed above)

-- Fix team_members policies that use auth.uid() directly
DROP POLICY IF EXISTS "Admins can invite members" ON team_members;
DROP POLICY IF EXISTS "Admins can update members" ON team_members;
DROP POLICY IF EXISTS "Users can accept own invitation" ON team_members;
DROP POLICY IF EXISTS "Users can leave team" ON team_members;

CREATE POLICY "Admins can invite members" ON team_members
  FOR INSERT WITH CHECK (
    is_team_admin(team_id)
    OR (
      user_id = (select auth.uid())
      AND role = 'owner'
      AND EXISTS (SELECT 1 FROM teams WHERE id = team_id AND owner_id = (select auth.uid()))
    )
  );

CREATE POLICY "Admins can update members" ON team_members
  FOR UPDATE USING (
    is_team_admin(team_id)
    AND NOT (role = 'owner' AND user_id = (select auth.uid()))
  );

CREATE POLICY "Users can accept own invitation" ON team_members
  FOR UPDATE USING (
    user_id = (select auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND status = 'accepted'
  );

CREATE POLICY "Users can leave team" ON team_members
  FOR DELETE USING (
    user_id = (select auth.uid())
    AND role != 'owner'
  );

-- =============================================
-- 1. profiles
-- =============================================
DROP POLICY IF EXISTS "Users can view own and team profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view own and team profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR id IN (
      SELECT tm2.user_id FROM team_members tm
      JOIN team_members tm2 ON tm2.team_id = tm.team_id AND tm2.status = 'accepted'
      WHERE tm.user_id = (select auth.uid()) AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

-- =============================================
-- 2. whatsapp_sessions
-- =============================================
DROP POLICY IF EXISTS "Users can view sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can update sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can insert sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can delete sessions" ON whatsapp_sessions;

CREATE POLICY "Users can view sessions" ON whatsapp_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can update sessions" ON whatsapp_sessions
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert sessions" ON whatsapp_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete sessions" ON whatsapp_sessions
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 3. ai_agents
-- =============================================
DROP POLICY IF EXISTS "Users can view agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can insert agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can update agents" ON ai_agents;
DROP POLICY IF EXISTS "Users can delete agents" ON ai_agents;

CREATE POLICY "Users can view agents" ON ai_agents
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert agents" ON ai_agents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update agents" ON ai_agents
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can delete agents" ON ai_agents
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

-- =============================================
-- 4. contacts
-- =============================================
DROP POLICY IF EXISTS "Users can view contacts" ON contacts;
DROP POLICY IF EXISTS "Users can insert contacts" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts" ON contacts;
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;

CREATE POLICY "Users can view contacts" ON contacts
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can insert contacts" ON contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can update contacts" ON contacts
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
        AND tm.status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can delete contacts" ON contacts
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid())
    )
  );

-- =============================================
-- 5. conversations
-- =============================================
DROP POLICY IF EXISTS "Users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON conversations;

CREATE POLICY "Users can view conversations" ON conversations
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
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
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
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
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_view_messages = true)
      ))
    )
  );

CREATE POLICY "Users can delete conversations" ON conversations
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid())
    )
  );

-- =============================================
-- 6. messages
-- =============================================
DROP POLICY IF EXISTS "Users can view messages" ON messages;
DROP POLICY IF EXISTS "Users can insert messages" ON messages;
DROP POLICY IF EXISTS "Users can update messages" ON messages;
DROP POLICY IF EXISTS "Users can delete messages" ON messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;

CREATE POLICY "Users can view messages" ON messages
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
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
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
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
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = ws.team_id
        AND tm.user_id = (select auth.uid())
        AND tm.status = 'accepted'
        AND (tm.role IN ('owner', 'admin') OR tm.can_send_messages = true)
      ))
    )
  );

CREATE POLICY "Users can delete messages" ON messages
  FOR DELETE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid())
    )
  );

-- =============================================
-- 7. wa_links
-- =============================================
DROP POLICY IF EXISTS "Users can view links" ON wa_links;
DROP POLICY IF EXISTS "Users can insert links" ON wa_links;
DROP POLICY IF EXISTS "Users can update links" ON wa_links;
DROP POLICY IF EXISTS "Users can delete links" ON wa_links;

CREATE POLICY "Users can view links" ON wa_links
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = (select auth.uid()) AND status = 'accepted'
    ))
  );

CREATE POLICY "Users can insert links" ON wa_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update links" ON wa_links
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = wa_links.team_id
      AND tm.user_id = (select auth.uid())
      AND tm.status = 'accepted'
      AND (tm.role IN ('owner', 'admin') OR tm.can_manage_links = true)
    ))
  );

CREATE POLICY "Users can delete links" ON wa_links
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 8. stats_daily
-- =============================================
DROP POLICY IF EXISTS "Users can view stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can insert stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can update stats" ON stats_daily;
DROP POLICY IF EXISTS "Users can delete stats" ON stats_daily;

CREATE POLICY "Users can view stats" ON stats_daily
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (
      session_id IN (
        SELECT ws.id FROM whatsapp_sessions ws
        WHERE ws.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ws.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.status = 'accepted'
          AND (tm.role IN ('owner', 'admin') OR tm.can_view_stats = true)
        )
      )
    )
  );

CREATE POLICY "Users can insert stats" ON stats_daily
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update stats" ON stats_daily
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete stats" ON stats_daily
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 9. knowledge_documents
-- =============================================
DROP POLICY IF EXISTS "Users can view documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can insert documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can update documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Users can delete documents" ON knowledge_documents;

CREATE POLICY "Users can view documents" ON knowledge_documents
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can insert documents" ON knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update documents" ON knowledge_documents
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND user_has_team_access(team_id))
  );

CREATE POLICY "Users can delete documents" ON knowledge_documents
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 10. knowledge_chunks
-- =============================================
DROP POLICY IF EXISTS "Users can view chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Users can insert chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Users can delete chunks" ON knowledge_chunks;

CREATE POLICY "Users can view chunks" ON knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR document_id IN (
      SELECT id FROM knowledge_documents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_view_knowledge = true)
      )
    )
  );

CREATE POLICY "Users can insert chunks" ON knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete chunks" ON knowledge_chunks
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 11. agent_knowledge_documents
-- =============================================
DROP POLICY IF EXISTS "Users can view own agent documents" ON agent_knowledge_documents;
DROP POLICY IF EXISTS "Users can insert own agent documents" ON agent_knowledge_documents;
DROP POLICY IF EXISTS "Users can delete own agent documents" ON agent_knowledge_documents;

CREATE POLICY "Users can view own agent documents" ON agent_knowledge_documents
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
    OR document_id IN (
      SELECT id FROM knowledge_documents WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

CREATE POLICY "Users can insert own agent documents" ON agent_knowledge_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (
      SELECT id FROM ai_agents WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

CREATE POLICY "Users can delete own agent documents" ON agent_knowledge_documents
  FOR DELETE TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- =============================================
-- 12. webhook_logs
-- =============================================
DROP POLICY IF EXISTS "Users can view webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "Users can delete webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "Users can delete webhook logs for their sessions" ON webhook_logs;

CREATE POLICY "Users can view webhook logs" ON webhook_logs
  FOR SELECT TO authenticated
  USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

CREATE POLICY "Users can delete webhook logs" ON webhook_logs
  FOR DELETE TO authenticated
  USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- =============================================
-- 13. Other tables with auth.uid() — also fix
-- =============================================

-- agent_tools
DROP POLICY IF EXISTS "Users can view tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can insert tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can update tools" ON agent_tools;
DROP POLICY IF EXISTS "Users can delete tools" ON agent_tools;

CREATE POLICY "Users can view tools" ON agent_tools
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can insert tools" ON agent_tools
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update tools" ON agent_tools
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can delete tools" ON agent_tools
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- tool_execution_logs
DROP POLICY IF EXISTS "Users can view tool logs" ON tool_execution_logs;
DROP POLICY IF EXISTS "Users can insert tool logs" ON tool_execution_logs;

CREATE POLICY "Users can view tool logs" ON tool_execution_logs
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR agent_id IN (
      SELECT id FROM ai_agents
      WHERE team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
        AND (role IN ('owner', 'admin') OR can_manage_agents = true)
      )
    )
  );

CREATE POLICY "Users can insert tool logs" ON tool_execution_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- conversation_tags
DROP POLICY IF EXISTS "Users can view tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can create tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can update tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can delete tags" ON conversation_tags;

CREATE POLICY "Users can view tags" ON conversation_tags
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR user_id IN (
      SELECT tm2.user_id FROM team_members tm
      JOIN team_members tm2 ON tm2.team_id = tm.team_id AND tm2.status = 'accepted'
      WHERE tm.user_id = (select auth.uid()) AND tm.status = 'accepted'
    )
  );

CREATE POLICY "Users can create tags" ON conversation_tags
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update tags" ON conversation_tags
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete tags" ON conversation_tags
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- conversation_tag_assignments
DROP POLICY IF EXISTS "Users can view tag assignments" ON conversation_tag_assignments;

CREATE POLICY "Users can view tag assignments" ON conversation_tag_assignments
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE ws.user_id = (select auth.uid())
      OR (ws.team_id IS NOT NULL AND ws.team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

-- booking_proposals
DROP POLICY IF EXISTS "Users can view booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Users can insert booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Users can update booking proposals" ON booking_proposals;

CREATE POLICY "Users can view booking proposals" ON booking_proposals
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can insert booking proposals" ON booking_proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can update booking proposals" ON booking_proposals
  FOR UPDATE TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

-- booking_link_clicks
DROP POLICY IF EXISTS "Users can insert booking clicks" ON booking_link_clicks;

CREATE POLICY "Users can insert booking clicks" ON booking_link_clicks
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (
      SELECT id FROM ai_agents
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

-- link_clicks
DROP POLICY IF EXISTS "Users can view link clicks" ON link_clicks;
DROP POLICY IF EXISTS "Users can delete link clicks" ON link_clicks;

CREATE POLICY "Users can view link clicks" ON link_clicks
  FOR SELECT TO authenticated
  USING (
    link_id IN (
      SELECT id FROM wa_links
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can delete link clicks" ON link_clicks
  FOR DELETE TO authenticated
  USING (
    link_id IN (
      SELECT id FROM wa_links WHERE user_id = (select auth.uid())
    )
  );

-- campaign_recipients
DROP POLICY IF EXISTS "Users can view campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can insert campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can update campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can delete campaign recipients" ON campaign_recipients;

CREATE POLICY "Users can view campaign recipients" ON campaign_recipients
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns
      WHERE user_id = (select auth.uid())
      OR (team_id IS NOT NULL AND team_id IN (
        SELECT team_id FROM team_members
        WHERE user_id = (select auth.uid()) AND status = 'accepted'
      ))
    )
  );

CREATE POLICY "Users can insert campaign recipients" ON campaign_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update campaign recipients" ON campaign_recipients
  FOR UPDATE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete campaign recipients" ON campaign_recipients
  FOR DELETE TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = (select auth.uid())
    )
  );

-- teams
DROP POLICY IF EXISTS "Users can view teams" ON teams;
DROP POLICY IF EXISTS "Users can insert teams" ON teams;
DROP POLICY IF EXISTS "Users can update teams" ON teams;
DROP POLICY IF EXISTS "Users can delete teams" ON teams;

CREATE POLICY "Users can view teams" ON teams
  FOR SELECT TO authenticated
  USING (
    owner_id = (select auth.uid())
    OR user_has_team_access(id)
  );

CREATE POLICY "Users can insert teams" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "Users can update teams" ON teams
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()));

CREATE POLICY "Users can delete teams" ON teams
  FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));

-- campaigns
DROP POLICY IF EXISTS "Users can view campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can insert campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns" ON campaigns;

CREATE POLICY "Users can view campaigns" ON campaigns
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (team_id IS NOT NULL AND team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = (select auth.uid()) AND status = 'accepted'
    ))
  );

CREATE POLICY "Users can insert campaigns" ON campaigns
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update campaigns" ON campaigns
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete campaigns" ON campaigns
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- payment_history
DROP POLICY IF EXISTS "Users can view payment history" ON payment_history;

CREATE POLICY "Users can view payment history" ON payment_history
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- team_invitations (admin policies use is_team_admin() which internally uses auth.uid() —
-- but those are function calls, not direct auth.uid(). Check if they also need fixing)
DROP POLICY IF EXISTS "Admins can view team invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can insert invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON team_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON team_invitations;

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

-- =============================================
-- 14. Drop OLD duplicate policies with different names (created in Supabase UI or older migrations)
-- These coexist with the new ones and cause "multiple_permissive_policies" warnings
-- =============================================

-- OLD booking_proposals policy
DROP POLICY IF EXISTS "Users can view booking proposals for their agents" ON booking_proposals;

-- OLD booking_link_clicks policy
DROP POLICY IF EXISTS "Users can view booking clicks for their agents" ON booking_link_clicks;

-- OLD link_clicks policies
DROP POLICY IF EXISTS "Users can read own link clicks" ON link_clicks;
DROP POLICY IF EXISTS "Users can delete own link clicks" ON link_clicks;

-- OLD webhook_logs policy
DROP POLICY IF EXISTS "Users can view webhook logs for their sessions" ON webhook_logs;
DROP POLICY IF EXISTS "Users can delete webhook logs for their sessions" ON webhook_logs;

-- OLD campaigns policies
DROP POLICY IF EXISTS "Users can create campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON campaigns;

-- OLD teams policies
DROP POLICY IF EXISTS "Users can view their teams" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Owners can update teams" ON teams;
DROP POLICY IF EXISTS "Owners can delete teams" ON teams;

-- OLD payment_history policy
DROP POLICY IF EXISTS "Users can view their own payment history" ON payment_history;

-- OLD conversation_tags policies
DROP POLICY IF EXISTS "Users can insert own tags" ON conversation_tags;
DROP POLICY IF EXISTS "Users can manage tags" ON conversation_tags;

-- OLD agent_tools policies (snake_case names from older migration)
DROP POLICY IF EXISTS "agent_tools_select" ON agent_tools;
DROP POLICY IF EXISTS "agent_tools_insert" ON agent_tools;
DROP POLICY IF EXISTS "agent_tools_update" ON agent_tools;
DROP POLICY IF EXISTS "agent_tools_delete" ON agent_tools;

-- OLD tool_execution_logs policies (snake_case names)
DROP POLICY IF EXISTS "tool_logs_select" ON tool_execution_logs;
DROP POLICY IF EXISTS "tool_logs_insert" ON tool_execution_logs;

-- =============================================
-- 15. user_alerts — new table not covered before
-- =============================================
DROP POLICY IF EXISTS "Users can view own alerts" ON user_alerts;
DROP POLICY IF EXISTS "Users can update own alerts" ON user_alerts;
DROP POLICY IF EXISTS "Users can delete own alerts" ON user_alerts;

CREATE POLICY "Users can view own alerts" ON user_alerts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own alerts" ON user_alerts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own alerts" ON user_alerts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 16. campaign_blacklist
-- =============================================
DROP POLICY IF EXISTS "Users can manage own blacklist" ON campaign_blacklist;
DROP POLICY IF EXISTS "Users can delete from blacklist" ON campaign_blacklist;

CREATE POLICY "Users can view own blacklist" ON campaign_blacklist
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own blacklist" ON campaign_blacklist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete from blacklist" ON campaign_blacklist
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 17. lifecycle_stages
-- =============================================
DROP POLICY IF EXISTS "lifecycle_stages_select" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_insert" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_update" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_delete" ON lifecycle_stages;

CREATE POLICY "lifecycle_stages_select" ON lifecycle_stages
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_insert" ON lifecycle_stages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_update" ON lifecycle_stages
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_delete" ON lifecycle_stages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================
-- 18. lifecycle_history
-- =============================================
DROP POLICY IF EXISTS "lifecycle_history_select" ON lifecycle_history;
DROP POLICY IF EXISTS "lifecycle_history_insert" ON lifecycle_history;

CREATE POLICY "lifecycle_history_select" ON lifecycle_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE c.id = lifecycle_history.conversation_id
      AND (ws.user_id = (select auth.uid())
        OR (ws.team_id IS NOT NULL AND user_has_team_access(ws.team_id)))
    )
  );

CREATE POLICY "lifecycle_history_insert" ON lifecycle_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE c.id = lifecycle_history.conversation_id
      AND (ws.user_id = (select auth.uid())
        OR (ws.team_id IS NOT NULL AND user_has_team_access(ws.team_id)))
    )
  );

-- =============================================
-- 19. session_teams — fix + merge duplicate permissive policies
-- =============================================
DROP POLICY IF EXISTS "Users can view session_teams for their sessions or teams" ON session_teams;
DROP POLICY IF EXISTS "Users can manage session_teams for their sessions" ON session_teams;

CREATE POLICY "Users can view session_teams" ON session_teams
  FOR SELECT TO authenticated
  USING (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid()))
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND status = 'accepted')
  );

CREATE POLICY "Users can insert session_teams" ON session_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete session_teams" ON session_teams
  FOR DELETE TO authenticated
  USING (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (select auth.uid()))
  );

-- =============================================
-- 20. agent_teams — fix + merge duplicate permissive policies
-- =============================================
DROP POLICY IF EXISTS "Users can view agent_teams for their agents or teams" ON agent_teams;
DROP POLICY IF EXISTS "Users can manage agent_teams for their agents" ON agent_teams;

CREATE POLICY "Users can view agent_teams" ON agent_teams
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM ai_agents WHERE user_id = (select auth.uid()))
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND status = 'accepted')
  );

CREATE POLICY "Users can insert agent_teams" ON agent_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IN (SELECT id FROM ai_agents WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete agent_teams" ON agent_teams
  FOR DELETE TO authenticated
  USING (
    agent_id IN (SELECT id FROM ai_agents WHERE user_id = (select auth.uid()))
  );

-- =============================================
-- 21. campaign_teams — fix + merge duplicate permissive policies
-- =============================================
DROP POLICY IF EXISTS "Users can view campaign_teams for their campaigns or teams" ON campaign_teams;
DROP POLICY IF EXISTS "Users can manage campaign_teams for their campaigns" ON campaign_teams;

CREATE POLICY "Users can view campaign_teams" ON campaign_teams
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = (select auth.uid()))
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND status = 'accepted')
  );

CREATE POLICY "Users can insert campaign_teams" ON campaign_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete campaign_teams" ON campaign_teams
  FOR DELETE TO authenticated
  USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = (select auth.uid()))
  );

-- =============================================
-- 22. link_teams — fix
-- =============================================
DROP POLICY IF EXISTS "Users can view link_teams for their links or teams" ON link_teams;
DROP POLICY IF EXISTS "Users can manage link_teams for their links" ON link_teams;

CREATE POLICY "Users can view link_teams" ON link_teams
  FOR SELECT TO authenticated
  USING (
    link_id IN (SELECT id FROM wa_links WHERE user_id = (select auth.uid()))
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND status = 'accepted')
  );

CREATE POLICY "Users can insert link_teams" ON link_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    link_id IN (SELECT id FROM wa_links WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete link_teams" ON link_teams
  FOR DELETE TO authenticated
  USING (
    link_id IN (SELECT id FROM wa_links WHERE user_id = (select auth.uid()))
  );

-- =============================================
-- 23. document_teams — fix
-- =============================================
DROP POLICY IF EXISTS "Users can view document_teams for their documents or teams" ON document_teams;
DROP POLICY IF EXISTS "Users can manage document_teams for their documents" ON document_teams;

CREATE POLICY "Users can view document_teams" ON document_teams
  FOR SELECT TO authenticated
  USING (
    document_id IN (SELECT id FROM knowledge_documents WHERE user_id = (select auth.uid()))
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = (select auth.uid()) AND status = 'accepted')
  );

CREATE POLICY "Users can insert document_teams" ON document_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    document_id IN (SELECT id FROM knowledge_documents WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete document_teams" ON document_teams
  FOR DELETE TO authenticated
  USING (
    document_id IN (SELECT id FROM knowledge_documents WHERE user_id = (select auth.uid()))
  );
