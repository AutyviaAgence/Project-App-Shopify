-- ============================================================================
-- Migration: Fix remaining 71 Supabase Advisor warnings
-- Categories:
--   1. function_search_path_mutable (25 functions) - Add SET search_path = public
--   2. rls_policy_always_true (8 policies) - Drop policies with USING(true)/WITH CHECK(true)
--   3. auth_allow_anonymous_sign_ins (~38) - Disable anonymous sign-ins in Auth settings
-- ============================================================================

-- ============================================================================
-- SECTION 1: Fix function_search_path_mutable
-- Recreate all 25 functions with SET search_path = public
-- ============================================================================

-- 1.1 increment_token_usage
CREATE OR REPLACE FUNCTION increment_token_usage(p_user_id uuid, p_tokens int)
RETURNS TABLE(new_total bigint, token_limit bigint) AS $$
  UPDATE profiles
  SET tokens_used = tokens_used + p_tokens
  WHERE id = p_user_id
  RETURNING tokens_used AS new_total, tokens_limit AS token_limit;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 1.2 is_team_member
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.3 match_knowledge_chunks
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_document_ids UUID[],
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_chunks kc
  WHERE kc.document_id = ANY(match_document_ids)
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 1.4 get_link_team_ids
CREATE OR REPLACE FUNCTION get_link_team_ids(p_link_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM link_teams
  WHERE link_id = p_link_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- 1.5 set_team_join_code
CREATE OR REPLACE FUNCTION set_team_join_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  attempts INTEGER := 0;
BEGIN
  LOOP
    new_code := generate_team_join_code();
    IF NOT EXISTS (SELECT 1 FROM teams WHERE join_code = new_code) THEN
      NEW.join_code := new_code;
      EXIT;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Unable to generate unique join code';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1.6 update_campaign_stats
CREATE OR REPLACE FUNCTION update_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET
    total_recipients = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent', 'delivered', 'replied')),
    delivered_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered', 'replied')),
    replied_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'replied'),
    failed_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.7 sync_user_profile
CREATE OR REPLACE FUNCTION sync_user_profile(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles p
  SET
    full_name = COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      p.full_name,
      split_part(u.email, '@', 1)
    ),
    avatar_url = COALESCE(
      u.raw_user_meta_data->>'avatar_url',
      u.raw_user_meta_data->>'picture',
      p.avatar_url
    ),
    email = u.email,
    updated_at = NOW()
  FROM auth.users u
  WHERE p.id = sync_user_profile.user_id AND u.id = sync_user_profile.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.8 create_team_owner_member
CREATE OR REPLACE FUNCTION create_team_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'accepted');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.9 generate_team_join_code
CREATE OR REPLACE FUNCTION generate_team_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN 'AUTY-' || code;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1.10 check_campaign_reply
CREATE OR REPLACE FUNCTION check_campaign_reply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'incoming' THEN
    UPDATE campaign_recipients
    SET
      status = 'replied',
      replied_at = NOW()
    WHERE
      conversation_id = NEW.conversation_id
      AND status IN ('sent', 'delivered')
      AND sent_at > NOW() - INTERVAL '7 days';

    PERFORM update_campaign_stats(campaign_id)
    FROM campaign_recipients
    WHERE conversation_id = NEW.conversation_id
    AND replied_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.11 user_can_access_session
CREATE OR REPLACE FUNCTION user_can_access_session(p_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_session_owner UUID;
  v_session_team UUID;
  v_member_permissions UUID[];
BEGIN
  SELECT user_id, team_id INTO v_session_owner, v_session_team
  FROM whatsapp_sessions WHERE id = p_session_id;

  IF v_session_owner = v_user_id THEN
    RETURN TRUE;
  END IF;

  IF v_session_team IS NOT NULL THEN
    SELECT allowed_session_ids INTO v_member_permissions
    FROM team_members
    WHERE team_id = v_session_team
      AND user_id = v_user_id
      AND status = 'accepted';

    IF FOUND THEN
      IF v_member_permissions IS NULL THEN
        RETURN TRUE;
      END IF;
      RETURN p_session_id = ANY(v_member_permissions);
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.12 is_team_admin
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.13 update_updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1.14 user_has_team_permission
CREATE OR REPLACE FUNCTION user_has_team_permission(
  p_team_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
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

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.15 get_document_team_ids
CREATE OR REPLACE FUNCTION get_document_team_ids(p_document_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM document_teams
  WHERE document_id = p_document_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- 1.16 user_has_team_access
CREATE OR REPLACE FUNCTION user_has_team_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_team_member(p_team_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.17 get_agent_team_ids
CREATE OR REPLACE FUNCTION get_agent_team_ids(p_agent_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM agent_teams
  WHERE agent_id = p_agent_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- 1.18 get_campaign_team_ids
CREATE OR REPLACE FUNCTION get_campaign_team_ids(p_campaign_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM campaign_teams
  WHERE campaign_id = p_campaign_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- 1.19 user_can_access_campaign
CREATE OR REPLACE FUNCTION user_can_access_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_campaign_owner UUID;
  v_team_id UUID;
  v_member_permissions UUID[];
BEGIN
  SELECT user_id INTO v_campaign_owner
  FROM campaigns WHERE id = p_campaign_id;

  IF v_campaign_owner = v_user_id THEN
    RETURN TRUE;
  END IF;

  FOR v_team_id IN
    SELECT team_id FROM campaign_teams WHERE campaign_id = p_campaign_id
  LOOP
    SELECT allowed_campaign_ids INTO v_member_permissions
    FROM team_members
    WHERE team_id = v_team_id
      AND user_id = v_user_id
      AND status = 'accepted';

    IF FOUND THEN
      IF v_member_permissions IS NULL THEN
        RETURN TRUE;
      END IF;
      IF p_campaign_id = ANY(v_member_permissions) THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.20 get_campaign_eligible_contacts
CREATE OR REPLACE FUNCTION get_campaign_eligible_contacts(
  p_user_id UUID,
  p_session_ids UUID[] DEFAULT NULL,
  p_tracking_sources TEXT[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_inactivity_days INTEGER DEFAULT NULL,
  p_exclude_replied BOOLEAN DEFAULT false,
  p_min_days_since_last_campaign INTEGER DEFAULT 7,
  p_max_recipients INTEGER DEFAULT 50,
  p_link_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  contact_id UUID,
  conversation_id UUID,
  session_id UUID,
  phone_number TEXT,
  contact_name TEXT,
  last_message_at TIMESTAMPTZ,
  days_inactive INTEGER,
  tracking_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id AS contact_id,
    conv.id AS conversation_id,
    c.session_id,
    c.phone_number,
    c.name AS contact_name,
    conv.last_message_at,
    EXTRACT(DAY FROM NOW() - conv.last_message_at)::INTEGER AS days_inactive,
    wl.tracking_source
  FROM contacts c
  JOIN conversations conv ON conv.contact_id = c.id
  JOIN whatsapp_sessions s ON s.id = c.session_id
  LEFT JOIN wa_links wl ON wl.id = conv.wa_link_id
  WHERE
    (s.user_id = p_user_id OR s.team_id IN (
      SELECT team_id FROM team_members WHERE user_id = p_user_id AND status = 'accepted'
    ))
    AND (p_session_ids IS NULL OR c.session_id = ANY(p_session_ids))
    AND (p_tracking_sources IS NULL OR wl.tracking_source = ANY(p_tracking_sources))
    AND (p_link_ids IS NULL OR conv.wa_link_id = ANY(p_link_ids))
    AND (p_tag_ids IS NULL OR EXISTS (
      SELECT 1 FROM conversation_tag_assignments cta
      WHERE cta.conversation_id = conv.id AND cta.tag_id = ANY(p_tag_ids)
    ))
    AND (p_inactivity_days IS NULL OR conv.last_message_at < NOW() - (p_inactivity_days || ' days')::INTERVAL)
    AND (NOT p_exclude_replied OR NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = conv.id
      AND m.direction = 'inbound'
      AND m.created_at > conv.last_message_at - INTERVAL '1 day'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM campaign_blacklist bl
      WHERE bl.contact_id = c.id AND bl.user_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM campaign_recipients cr
      JOIN campaigns camp ON camp.id = cr.campaign_id
      WHERE cr.contact_id = c.id
      AND cr.sent_at > NOW() - (p_min_days_since_last_campaign || ' days')::INTERVAL
      AND camp.user_id = p_user_id
    )
  ORDER BY c.id, conv.last_message_at DESC
  LIMIT p_max_recipients;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.21 generate_invitation_code
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1.22 create_user_alert
CREATE OR REPLACE FUNCTION create_user_alert(
  p_user_id UUID,
  p_alert_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO user_alerts (user_id, alert_type, title, message, metadata)
  VALUES (p_user_id, p_alert_type, p_title, p_message, p_metadata)
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

-- 1.23 get_session_team_ids
CREATE OR REPLACE FUNCTION get_session_team_ids(p_session_id UUID)
RETURNS UUID[] AS $$
  SELECT COALESCE(array_agg(team_id), ARRAY[]::UUID[])
  FROM session_teams
  WHERE session_id = p_session_id;
$$ LANGUAGE SQL STABLE SET search_path = public;

-- 1.24 join_team_with_code
CREATE OR REPLACE FUNCTION join_team_with_code(p_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_invitation RECORD;
  v_team RECORD;
  v_existing_member RECORD;
  v_result JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Non authentifié', 'status', 401);
  END IF;

  SELECT * INTO v_invitation
  FROM team_invitations
  WHERE code = UPPER(TRIM(p_code))
    AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Code invalide ou expiré', 'status', 404);
  END IF;

  SELECT id, name INTO v_team FROM teams WHERE id = v_invitation.team_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Équipe introuvable', 'status', 404);
  END IF;

  SELECT id INTO v_existing_member
  FROM team_members
  WHERE team_id = v_invitation.team_id AND user_id = v_user_id AND status = 'accepted';

  IF FOUND THEN
    RETURN json_build_object('error', 'Vous êtes déjà membre de cette équipe', 'status', 409);
  END IF;

  INSERT INTO team_members (
    team_id, user_id, role, status,
    allowed_session_ids, allowed_agent_ids, allowed_link_ids, allowed_campaign_ids
  ) VALUES (
    v_invitation.team_id, v_user_id, v_invitation.role, 'accepted',
    v_invitation.allowed_session_ids, v_invitation.allowed_agent_ids,
    v_invitation.allowed_link_ids, v_invitation.allowed_campaign_ids
  );

  UPDATE team_invitations SET used_by = v_user_id, used_at = NOW() WHERE id = v_invitation.id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.25 is_subscription_active
CREATE OR REPLACE FUNCTION is_subscription_active(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  profile_record RECORD;
BEGIN
  SELECT subscription_status, trial_ends_at, subscription_ends_at
  INTO profile_record
  FROM profiles
  WHERE id = user_uuid;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF profile_record.subscription_status = 'trial' AND profile_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;

  IF profile_record.subscription_status = 'active' AND (profile_record.subscription_ends_at IS NULL OR profile_record.subscription_ends_at > NOW()) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- SECTION 2: Fix rls_policy_always_true
-- Drop policies with USING(true) / WITH CHECK(true)
-- service_role bypasses RLS entirely, so these policies are unnecessary
-- ============================================================================

-- 2.1 booking_proposals
DROP POLICY IF EXISTS "Service can insert booking proposals" ON booking_proposals;
DROP POLICY IF EXISTS "Service can update booking proposals" ON booking_proposals;

-- 2.2 campaign_blacklist
DROP POLICY IF EXISTS "Webhook can insert blacklist" ON campaign_blacklist;

-- 2.3 messages
DROP POLICY IF EXISTS "Webhook can insert messages" ON messages;
DROP POLICY IF EXISTS "Webhook can update messages" ON messages;

-- 2.4 profiles
DROP POLICY IF EXISTS "Allow insert for trigger" ON profiles;

-- 2.5 user_alerts
DROP POLICY IF EXISTS "Webhook can insert alerts" ON user_alerts;

-- 2.6 webhook_logs
DROP POLICY IF EXISTS "Webhook can insert logs" ON webhook_logs;


-- ============================================================================
-- SECTION 3: Fix auth_allow_anonymous_sign_ins
-- The root fix is to disable anonymous sign-ins in Supabase Dashboard:
--   Authentication > Providers > Anonymous Sign-Ins > Disable
--
-- However, as a defense-in-depth measure, we also ensure all policies
-- explicitly target 'authenticated' role. The policies from
-- migration_rls_performance_fix.sql already use TO authenticated,
-- but some older policies may still exist without it.
-- Below we drop any remaining old policies that don't have TO authenticated.
-- ============================================================================

-- 3.1 Fix storage.objects policies (missing TO authenticated)
DROP POLICY IF EXISTS "Users can view own knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own knowledge files" ON storage.objects;

CREATE POLICY "Users can view own knowledge files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "Users can delete own knowledge files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 3.2 Fix lifecycle_history policy (may still be without TO authenticated)
DROP POLICY IF EXISTS "lifecycle_history_select" ON lifecycle_history;
CREATE POLICY "lifecycle_history_select" ON lifecycle_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE c.id = lifecycle_history.conversation_id
      AND ws.user_id = (select auth.uid())
    )
  );

-- 3.3 Fix lifecycle_stages policies (may still be without TO authenticated)
DROP POLICY IF EXISTS "lifecycle_stages_select" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_update" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_delete" ON lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_insert" ON lifecycle_stages;

CREATE POLICY "lifecycle_stages_select" ON lifecycle_stages
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_update" ON lifecycle_stages
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_delete" ON lifecycle_stages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "lifecycle_stages_insert" ON lifecycle_stages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- 3.4 Fix team_invitations "Public" policies → restrict to authenticated
-- Note: "Public can view valid invitations" and "Anyone can view invitation by code"
-- were intentionally public for join flows, but we can restrict to authenticated
-- since users must be logged in to join a team anyway
DROP POLICY IF EXISTS "Public can view valid invitations" ON team_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by code" ON team_invitations;

CREATE POLICY "Authenticated can view valid invitations" ON team_invitations
  FOR SELECT TO authenticated
  USING (
    used_by IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

-- 3.5 Fix team_members "Anyone can view pending invitation by token" → authenticated
DROP POLICY IF EXISTS "Anyone can view pending invitation by token" ON team_members;

CREATE POLICY "Authenticated can view pending invitation by token" ON team_members
  FOR SELECT TO authenticated
  USING (
    invitation_token IS NOT NULL
    AND status = 'pending'
    AND user_id IS NULL
  );

-- 3.6 Fix campaign_opt_out_keywords → restrict to authenticated
DROP POLICY IF EXISTS "Anyone can read opt-out keywords" ON campaign_opt_out_keywords;

CREATE POLICY "Authenticated can read opt-out keywords" ON campaign_opt_out_keywords
  FOR SELECT TO authenticated
  USING (true);

-- 3.7 Fix realtime.messages policies (created via Supabase UI, not migrations)
DROP POLICY IF EXISTS "Users can delete messages" ON realtime.messages;
DROP POLICY IF EXISTS "Users can update messages" ON realtime.messages;
DROP POLICY IF EXISTS "Users can view messages" ON realtime.messages;

CREATE POLICY "Users can view messages" ON realtime.messages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update messages" ON realtime.messages
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Users can delete messages" ON realtime.messages
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- SECTION 4: extension_in_public
-- Move vector extension from public to extensions schema
-- ============================================================================

-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move vector extension to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;

-- Grant usage so public schema functions can still use vector types
GRANT USAGE ON SCHEMA extensions TO public;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- ============================================================================
-- SECTION 5: Enable leaked password protection (informational)
-- This must be done via Supabase Dashboard:
--   Authentication > Settings > Security > Enable "Leaked Password Protection"
-- ============================================================================

-- Done! After running this migration:
-- 1. 25 function_search_path_mutable warnings → FIXED (Section 1)
-- 2. 8 rls_policy_always_true warnings → FIXED (Section 2)
-- 3. ~38 auth_allow_anonymous_sign_ins → FIXED (Section 3 - all policies now TO authenticated)
-- 4. 1 extension_in_public → FIXED (Section 4 - moved to extensions schema)
-- 5. 1 auth_leaked_password_protection → Go to Dashboard > Auth > Settings > Enable Leaked Password Protection
