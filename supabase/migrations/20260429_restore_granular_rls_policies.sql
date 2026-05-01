-- ============================================================
-- MIGRATION: Restauration des RLS policies granulaires
-- Remplace les policies FOR ALL simplifiées par des policies
-- per-opération (SELECT/INSERT/UPDATE/DELETE) avec TO authenticated
-- Adapté pour la version actuelle (email_sessions, contacts nullable, etc.)
-- ============================================================

-- ============================================================
-- HELPER: is_team_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = auth.uid()
      AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id
      AND owner_id = auth.uid()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_team_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid) TO authenticated;

-- ============================================================
-- profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
DROP POLICY IF EXISTS "Users manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles select" ON public.profiles;
DROP POLICY IF EXISTS "profiles update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- tenants (lecture publique, écriture service_role uniquement)
-- ============================================================
DROP POLICY IF EXISTS "tenants_all" ON public.tenants;
DROP POLICY IF EXISTS "Public read for tenants" ON public.tenants;
DROP POLICY IF EXISTS "Service role manages tenants" ON public.tenants;
DROP POLICY IF EXISTS "tenants_public_read" ON public.tenants;

CREATE POLICY "tenants_public_read"
  ON public.tenants FOR SELECT
  USING (true);

-- ============================================================
-- onboarding_configs
-- ============================================================
DROP POLICY IF EXISTS "onboarding_configs_all" ON public.onboarding_configs;
DROP POLICY IF EXISTS "Users manage their onboarding config" ON public.onboarding_configs;
DROP POLICY IF EXISTS "onboarding_configs_select" ON public.onboarding_configs;
DROP POLICY IF EXISTS "onboarding_configs_insert" ON public.onboarding_configs;
DROP POLICY IF EXISTS "onboarding_configs_update" ON public.onboarding_configs;
DROP POLICY IF EXISTS "onboarding_configs_delete" ON public.onboarding_configs;

CREATE POLICY "onboarding_configs_select"
  ON public.onboarding_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "onboarding_configs_insert"
  ON public.onboarding_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "onboarding_configs_update"
  ON public.onboarding_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "onboarding_configs_delete"
  ON public.onboarding_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- teams
-- ============================================================
DROP POLICY IF EXISTS "teams_all" ON public.teams;
DROP POLICY IF EXISTS "Users manage their teams" ON public.teams;
DROP POLICY IF EXISTS "teams_select" ON public.teams;
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_update" ON public.teams;
DROP POLICY IF EXISTS "teams_delete" ON public.teams;

CREATE POLICY "teams_select"
  ON public.teams FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_delete"
  ON public.teams FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================
-- team_members
-- ============================================================
DROP POLICY IF EXISTS "team_members_all" ON public.team_members;
DROP POLICY IF EXISTS "Users manage team members" ON public.team_members;
DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete" ON public.team_members;

CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_members.team_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm2
      WHERE tm2.team_id = team_members.team_id
        AND tm2.user_id = auth.uid()
        AND tm2.status = 'active'
    )
  );

CREATE POLICY "team_members_insert"
  ON public.team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_id)
  );

CREATE POLICY "team_members_update"
  ON public.team_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_members.team_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_members.team_id)
  );

CREATE POLICY "team_members_delete"
  ON public.team_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_members.team_id)
  );

-- ============================================================
-- team_invitations
-- ============================================================
DROP POLICY IF EXISTS "team_invitations_all" ON public.team_invitations;
DROP POLICY IF EXISTS "Users manage team invitations" ON public.team_invitations;
DROP POLICY IF EXISTS "team_invitations_select" ON public.team_invitations;
DROP POLICY IF EXISTS "team_invitations_insert" ON public.team_invitations;
DROP POLICY IF EXISTS "team_invitations_update" ON public.team_invitations;
DROP POLICY IF EXISTS "team_invitations_delete" ON public.team_invitations;

CREATE POLICY "team_invitations_select"
  ON public.team_invitations FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_invitations.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_invitations.team_id)
  );

CREATE POLICY "team_invitations_insert"
  ON public.team_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.teams
        WHERE id = team_id AND owner_id = auth.uid()
      )
      OR is_team_admin(team_id)
    )
  );

CREATE POLICY "team_invitations_update"
  ON public.team_invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_invitations.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_invitations.team_id)
  );

CREATE POLICY "team_invitations_delete"
  ON public.team_invitations FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_invitations.team_id AND owner_id = auth.uid()
    )
    OR is_team_admin(team_invitations.team_id)
  );

-- ============================================================
-- whatsapp_sessions
-- ============================================================
DROP POLICY IF EXISTS "whatsapp_sessions_all" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users manage their WA sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_select" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_insert" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_update" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_delete" ON public.whatsapp_sessions;

CREATE POLICY "whatsapp_sessions_select"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = whatsapp_sessions.id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "whatsapp_sessions_insert"
  ON public.whatsapp_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "whatsapp_sessions_update"
  ON public.whatsapp_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "whatsapp_sessions_delete"
  ON public.whatsapp_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- email_sessions
-- ============================================================
DROP POLICY IF EXISTS "email_sessions_all" ON public.email_sessions;
DROP POLICY IF EXISTS "Users can manage their email sessions" ON public.email_sessions;
DROP POLICY IF EXISTS "email_sessions_select" ON public.email_sessions;
DROP POLICY IF EXISTS "email_sessions_insert" ON public.email_sessions;
DROP POLICY IF EXISTS "email_sessions_update" ON public.email_sessions;
DROP POLICY IF EXISTS "email_sessions_delete" ON public.email_sessions;

CREATE POLICY "email_sessions_select"
  ON public.email_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.email_session_teams est ON est.team_id = tm.team_id
      WHERE est.email_session_id = email_sessions.id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "email_sessions_insert"
  ON public.email_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "email_sessions_update"
  ON public.email_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "email_sessions_delete"
  ON public.email_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- email_session_teams
-- ============================================================
DROP POLICY IF EXISTS "email_session_teams_all" ON public.email_session_teams;
DROP POLICY IF EXISTS "email_session_teams_select" ON public.email_session_teams;
DROP POLICY IF EXISTS "email_session_teams_insert" ON public.email_session_teams;
DROP POLICY IF EXISTS "email_session_teams_delete" ON public.email_session_teams;

CREATE POLICY "email_session_teams_select"
  ON public.email_session_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = email_session_teams.email_session_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = email_session_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "email_session_teams_insert"
  ON public.email_session_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = email_session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "email_session_teams_delete"
  ON public.email_session_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = email_session_teams.email_session_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- canned_responses
-- ============================================================
DROP POLICY IF EXISTS "canned_responses_all" ON public.canned_responses;
DROP POLICY IF EXISTS "Users can manage their canned responses" ON public.canned_responses;
DROP POLICY IF EXISTS "canned_responses_select" ON public.canned_responses;
DROP POLICY IF EXISTS "canned_responses_insert" ON public.canned_responses;
DROP POLICY IF EXISTS "canned_responses_update" ON public.canned_responses;
DROP POLICY IF EXISTS "canned_responses_delete" ON public.canned_responses;

CREATE POLICY "canned_responses_select"
  ON public.canned_responses FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_id = canned_responses.team_id AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "canned_responses_insert"
  ON public.canned_responses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "canned_responses_update"
  ON public.canned_responses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "canned_responses_delete"
  ON public.canned_responses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- ai_agents
-- ============================================================
DROP POLICY IF EXISTS "ai_agents_all" ON public.ai_agents;
DROP POLICY IF EXISTS "Users manage their agents" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_select" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_insert" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_update" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_delete" ON public.ai_agents;

CREATE POLICY "ai_agents_select"
  ON public.ai_agents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.agent_teams at2 ON at2.team_id = tm.team_id
      WHERE at2.agent_id = ai_agents.id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_agents_insert"
  ON public.ai_agents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_agents_update"
  ON public.ai_agents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_agents_delete"
  ON public.ai_agents FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- qualifier_routes (accès via l'agent owner)
-- ============================================================
DROP POLICY IF EXISTS "qualifier_routes_all" ON public.qualifier_routes;
DROP POLICY IF EXISTS "Users manage qualifier routes" ON public.qualifier_routes;
DROP POLICY IF EXISTS "qualifier_routes_select" ON public.qualifier_routes;
DROP POLICY IF EXISTS "qualifier_routes_insert" ON public.qualifier_routes;
DROP POLICY IF EXISTS "qualifier_routes_update" ON public.qualifier_routes;
DROP POLICY IF EXISTS "qualifier_routes_delete" ON public.qualifier_routes;

CREATE POLICY "qualifier_routes_select"
  ON public.qualifier_routes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = qualifier_routes.agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "qualifier_routes_insert"
  ON public.qualifier_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "qualifier_routes_update"
  ON public.qualifier_routes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = qualifier_routes.agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "qualifier_routes_delete"
  ON public.qualifier_routes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = qualifier_routes.agent_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- oauth_credentials
-- ============================================================
DROP POLICY IF EXISTS "oauth_credentials_all" ON public.oauth_credentials;
DROP POLICY IF EXISTS "Users manage their credentials" ON public.oauth_credentials;
DROP POLICY IF EXISTS "oauth_credentials_select" ON public.oauth_credentials;
DROP POLICY IF EXISTS "oauth_credentials_insert" ON public.oauth_credentials;
DROP POLICY IF EXISTS "oauth_credentials_update" ON public.oauth_credentials;
DROP POLICY IF EXISTS "oauth_credentials_delete" ON public.oauth_credentials;

CREATE POLICY "oauth_credentials_select"
  ON public.oauth_credentials FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "oauth_credentials_insert"
  ON public.oauth_credentials FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "oauth_credentials_update"
  ON public.oauth_credentials FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "oauth_credentials_delete"
  ON public.oauth_credentials FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- agent_tools
-- ============================================================
DROP POLICY IF EXISTS "agent_tools_all" ON public.agent_tools;
DROP POLICY IF EXISTS "Users manage their agent tools" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_select" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_insert" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_update" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_delete" ON public.agent_tools;

CREATE POLICY "agent_tools_select"
  ON public.agent_tools FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "agent_tools_insert"
  ON public.agent_tools FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "agent_tools_update"
  ON public.agent_tools FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "agent_tools_delete"
  ON public.agent_tools FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- tool_execution_logs
-- ============================================================
DROP POLICY IF EXISTS "tool_execution_logs_all" ON public.tool_execution_logs;
DROP POLICY IF EXISTS "Users view their tool logs" ON public.tool_execution_logs;
DROP POLICY IF EXISTS "tool_execution_logs_select" ON public.tool_execution_logs;
DROP POLICY IF EXISTS "tool_execution_logs_insert" ON public.tool_execution_logs;

CREATE POLICY "tool_execution_logs_select"
  ON public.tool_execution_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "tool_execution_logs_insert"
  ON public.tool_execution_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- contacts
-- NOTE: session_id est nullable (contacts email ont seulement email_session_id)
-- ============================================================
DROP POLICY IF EXISTS "contacts_all" ON public.contacts;
DROP POLICY IF EXISTS "Users manage their contacts" ON public.contacts;
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;

CREATE POLICY "contacts_select"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = contacts.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = contacts.email_session_id AND user_id = auth.uid()
    ))
    OR (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = contacts.session_id
        AND tm.user_id = auth.uid()
    ))
  );

CREATE POLICY "contacts_insert"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = email_session_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY "contacts_update"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = contacts.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = contacts.email_session_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY "contacts_delete"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = contacts.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = contacts.email_session_id AND user_id = auth.uid()
    ))
  );

-- ============================================================
-- conversation_tags
-- ============================================================
DROP POLICY IF EXISTS "conversation_tags_all" ON public.conversation_tags;
DROP POLICY IF EXISTS "Users manage their tags" ON public.conversation_tags;
DROP POLICY IF EXISTS "conversation_tags_select" ON public.conversation_tags;
DROP POLICY IF EXISTS "conversation_tags_insert" ON public.conversation_tags;
DROP POLICY IF EXISTS "conversation_tags_update" ON public.conversation_tags;
DROP POLICY IF EXISTS "conversation_tags_delete" ON public.conversation_tags;

CREATE POLICY "conversation_tags_select"
  ON public.conversation_tags FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = conversation_tags.team_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY "conversation_tags_insert"
  ON public.conversation_tags FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "conversation_tags_update"
  ON public.conversation_tags FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "conversation_tags_delete"
  ON public.conversation_tags FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- lifecycle_stages
-- ============================================================
DROP POLICY IF EXISTS "lifecycle_stages_all" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "Users manage their lifecycle stages" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_select" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_insert" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_update" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_delete" ON public.lifecycle_stages;

CREATE POLICY "lifecycle_stages_select"
  ON public.lifecycle_stages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_insert"
  ON public.lifecycle_stages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_update"
  ON public.lifecycle_stages FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_delete"
  ON public.lifecycle_stages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- conversations
-- NOTE: session_id peut être NULL pour les convs email
-- ============================================================
DROP POLICY IF EXISTS "conversations_all" ON public.conversations;
DROP POLICY IF EXISTS "Users manage their conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = conversations.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = conversations.email_session_id AND user_id = auth.uid()
    ))
    OR (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = conversations.session_id
        AND tm.user_id = auth.uid()
        AND tm.can_view_messages = true
    ))
  );

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = email_session_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = conversations.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = conversations.email_session_id AND user_id = auth.uid()
    ))
    OR (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = conversations.session_id
        AND tm.user_id = auth.uid()
        AND tm.can_send_messages = true
    ))
  );

CREATE POLICY "conversations_delete"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (
    (session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = conversations.session_id AND user_id = auth.uid()
    ))
    OR (email_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_sessions
      WHERE id = conversations.email_session_id AND user_id = auth.uid()
    ))
  );

-- ============================================================
-- conversation_tag_assignments
-- ============================================================
DROP POLICY IF EXISTS "conversation_tag_assignments_all" ON public.conversation_tag_assignments;
DROP POLICY IF EXISTS "Users manage tag assignments" ON public.conversation_tag_assignments;
DROP POLICY IF EXISTS "conversation_tag_assignments_select" ON public.conversation_tag_assignments;
DROP POLICY IF EXISTS "conversation_tag_assignments_insert" ON public.conversation_tag_assignments;
DROP POLICY IF EXISTS "conversation_tag_assignments_delete" ON public.conversation_tag_assignments;

CREATE POLICY "conversation_tag_assignments_select"
  ON public.conversation_tag_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_tag_assignments.conversation_id
        AND (
          (c.session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.whatsapp_sessions WHERE id = c.session_id AND user_id = auth.uid()
          ))
          OR (c.email_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.email_sessions WHERE id = c.email_session_id AND user_id = auth.uid()
          ))
        )
    )
  );

CREATE POLICY "conversation_tag_assignments_insert"
  ON public.conversation_tag_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          (c.session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.whatsapp_sessions WHERE id = c.session_id AND user_id = auth.uid()
          ))
          OR (c.email_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.email_sessions WHERE id = c.email_session_id AND user_id = auth.uid()
          ))
        )
    )
  );

CREATE POLICY "conversation_tag_assignments_delete"
  ON public.conversation_tag_assignments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_tag_assignments.conversation_id
        AND (
          (c.session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.whatsapp_sessions WHERE id = c.session_id AND user_id = auth.uid()
          ))
          OR (c.email_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.email_sessions WHERE id = c.email_session_id AND user_id = auth.uid()
          ))
        )
    )
  );

-- ============================================================
-- lifecycle_history
-- ============================================================
DROP POLICY IF EXISTS "lifecycle_history_all" ON public.lifecycle_history;
DROP POLICY IF EXISTS "Users view their lifecycle history" ON public.lifecycle_history;
DROP POLICY IF EXISTS "lifecycle_history_select" ON public.lifecycle_history;
DROP POLICY IF EXISTS "lifecycle_history_insert" ON public.lifecycle_history;

CREATE POLICY "lifecycle_history_select"
  ON public.lifecycle_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = lifecycle_history.conversation_id
        AND (
          (c.session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.whatsapp_sessions WHERE id = c.session_id AND user_id = auth.uid()
          ))
          OR (c.email_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.email_sessions WHERE id = c.email_session_id AND user_id = auth.uid()
          ))
        )
    )
  );

CREATE POLICY "lifecycle_history_insert"
  ON public.lifecycle_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          (c.session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.whatsapp_sessions WHERE id = c.session_id AND user_id = auth.uid()
          ))
          OR (c.email_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.email_sessions WHERE id = c.email_session_id AND user_id = auth.uid()
          ))
        )
    )
  );

-- ============================================================
-- messages
-- NOTE: session_id est NOT NULL sur la table messages mais les
-- messages email utilisent quand même session_id (via webhook email).
-- Accès via la whatsapp_session owner ou team member.
-- ============================================================
DROP POLICY IF EXISTS "messages_all" ON public.messages;
DROP POLICY IF EXISTS "Users manage their messages" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = messages.session_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = messages.session_id
        AND tm.user_id = auth.uid()
        AND tm.can_view_messages = true
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.session_teams st ON st.team_id = tm.team_id
      WHERE st.session_id = session_id
        AND tm.user_id = auth.uid()
        AND tm.can_send_messages = true
    )
  );

CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = messages.session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "messages_delete"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = messages.session_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- knowledge_documents
-- ============================================================
DROP POLICY IF EXISTS "knowledge_documents_all" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Users manage their knowledge" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_update" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_delete" ON public.knowledge_documents;

CREATE POLICY "knowledge_documents_select"
  ON public.knowledge_documents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.document_teams dt ON dt.team_id = tm.team_id
      WHERE dt.document_id = knowledge_documents.id
        AND tm.user_id = auth.uid()
        AND tm.can_view_knowledge = true
    ))
  );

CREATE POLICY "knowledge_documents_insert"
  ON public.knowledge_documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "knowledge_documents_update"
  ON public.knowledge_documents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "knowledge_documents_delete"
  ON public.knowledge_documents FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- knowledge_chunks
-- ============================================================
DROP POLICY IF EXISTS "knowledge_chunks_all" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "Users manage their chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_select" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_insert" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "knowledge_chunks_delete" ON public.knowledge_chunks;

CREATE POLICY "knowledge_chunks_select"
  ON public.knowledge_chunks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "knowledge_chunks_insert"
  ON public.knowledge_chunks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "knowledge_chunks_delete"
  ON public.knowledge_chunks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- agent_knowledge_documents
-- ============================================================
DROP POLICY IF EXISTS "agent_knowledge_documents_all" ON public.agent_knowledge_documents;
DROP POLICY IF EXISTS "Users manage agent knowledge links" ON public.agent_knowledge_documents;
DROP POLICY IF EXISTS "agent_knowledge_documents_select" ON public.agent_knowledge_documents;
DROP POLICY IF EXISTS "agent_knowledge_documents_insert" ON public.agent_knowledge_documents;
DROP POLICY IF EXISTS "agent_knowledge_documents_delete" ON public.agent_knowledge_documents;

CREATE POLICY "agent_knowledge_documents_select"
  ON public.agent_knowledge_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_knowledge_documents.agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "agent_knowledge_documents_insert"
  ON public.agent_knowledge_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "agent_knowledge_documents_delete"
  ON public.agent_knowledge_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_knowledge_documents.agent_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- agent_teams
-- ============================================================
DROP POLICY IF EXISTS "agent_teams_all" ON public.agent_teams;
DROP POLICY IF EXISTS "Users manage agent teams" ON public.agent_teams;
DROP POLICY IF EXISTS "agent_teams_select" ON public.agent_teams;
DROP POLICY IF EXISTS "agent_teams_insert" ON public.agent_teams;
DROP POLICY IF EXISTS "agent_teams_delete" ON public.agent_teams;

CREATE POLICY "agent_teams_select"
  ON public.agent_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_teams.agent_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = agent_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "agent_teams_insert"
  ON public.agent_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "agent_teams_delete"
  ON public.agent_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_teams.agent_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- document_teams
-- ============================================================
DROP POLICY IF EXISTS "document_teams_all" ON public.document_teams;
DROP POLICY IF EXISTS "Users manage document teams" ON public.document_teams;
DROP POLICY IF EXISTS "document_teams_select" ON public.document_teams;
DROP POLICY IF EXISTS "document_teams_insert" ON public.document_teams;
DROP POLICY IF EXISTS "document_teams_delete" ON public.document_teams;

CREATE POLICY "document_teams_select"
  ON public.document_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents
      WHERE id = document_teams.document_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = document_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "document_teams_insert"
  ON public.document_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents
      WHERE id = document_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "document_teams_delete"
  ON public.document_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents
      WHERE id = document_teams.document_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- session_teams
-- ============================================================
DROP POLICY IF EXISTS "session_teams_all" ON public.session_teams;
DROP POLICY IF EXISTS "Users manage session teams" ON public.session_teams;
DROP POLICY IF EXISTS "session_teams_select" ON public.session_teams;
DROP POLICY IF EXISTS "session_teams_insert" ON public.session_teams;
DROP POLICY IF EXISTS "session_teams_delete" ON public.session_teams;

CREATE POLICY "session_teams_select"
  ON public.session_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_teams.session_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = session_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "session_teams_insert"
  ON public.session_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "session_teams_delete"
  ON public.session_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = session_teams.session_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- wa_links
-- ============================================================
DROP POLICY IF EXISTS "wa_links_all" ON public.wa_links;
DROP POLICY IF EXISTS "Users manage their links" ON public.wa_links;
DROP POLICY IF EXISTS "wa_links_select" ON public.wa_links;
DROP POLICY IF EXISTS "wa_links_insert" ON public.wa_links;
DROP POLICY IF EXISTS "wa_links_update" ON public.wa_links;
DROP POLICY IF EXISTS "wa_links_delete" ON public.wa_links;

CREATE POLICY "wa_links_select"
  ON public.wa_links FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.link_teams lt ON lt.team_id = tm.team_id
      WHERE lt.link_id = wa_links.id
        AND tm.user_id = auth.uid()
        AND tm.can_manage_links = true
    )
  );

CREATE POLICY "wa_links_insert"
  ON public.wa_links FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wa_links_update"
  ON public.wa_links FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.link_teams lt ON lt.team_id = tm.team_id
      WHERE lt.link_id = wa_links.id
        AND tm.user_id = auth.uid()
        AND tm.can_manage_links = true
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.link_teams lt ON lt.team_id = tm.team_id
      WHERE lt.link_id = wa_links.id
        AND tm.user_id = auth.uid()
        AND tm.can_manage_links = true
        AND tm.status = 'active'
    )
  );

CREATE POLICY "wa_links_delete"
  ON public.wa_links FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- link_teams
-- ============================================================
DROP POLICY IF EXISTS "link_teams_all" ON public.link_teams;
DROP POLICY IF EXISTS "Users manage link teams" ON public.link_teams;
DROP POLICY IF EXISTS "link_teams_select" ON public.link_teams;
DROP POLICY IF EXISTS "link_teams_insert" ON public.link_teams;
DROP POLICY IF EXISTS "link_teams_delete" ON public.link_teams;

CREATE POLICY "link_teams_select"
  ON public.link_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wa_links
      WHERE id = link_teams.link_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = link_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "link_teams_insert"
  ON public.link_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wa_links
      WHERE id = link_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "link_teams_delete"
  ON public.link_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wa_links
      WHERE id = link_teams.link_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- link_clicks (insert public via webhook, lecture propriétaire)
-- NOTE: pas de user_id sur cette table
-- ============================================================
DROP POLICY IF EXISTS "link_clicks_all" ON public.link_clicks;
DROP POLICY IF EXISTS "Anyone can create link clicks" ON public.link_clicks;
DROP POLICY IF EXISTS "Users view their link clicks" ON public.link_clicks;
DROP POLICY IF EXISTS "link_clicks_select" ON public.link_clicks;
DROP POLICY IF EXISTS "link_clicks_insert" ON public.link_clicks;

CREATE POLICY "link_clicks_select"
  ON public.link_clicks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wa_links
      WHERE id = link_clicks.link_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "link_clicks_insert"
  ON public.link_clicks FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- booking_proposals (accès via l'agent owner)
-- NOTE: pas de user_id direct sur cette table
-- ============================================================
DROP POLICY IF EXISTS "booking_proposals_all" ON public.booking_proposals;
DROP POLICY IF EXISTS "Users manage their booking proposals" ON public.booking_proposals;
DROP POLICY IF EXISTS "booking_proposals_select" ON public.booking_proposals;
DROP POLICY IF EXISTS "booking_proposals_insert" ON public.booking_proposals;
DROP POLICY IF EXISTS "booking_proposals_update" ON public.booking_proposals;

CREATE POLICY "booking_proposals_select"
  ON public.booking_proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = booking_proposals.agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "booking_proposals_insert"
  ON public.booking_proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "booking_proposals_update"
  ON public.booking_proposals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = booking_proposals.agent_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- booking_link_clicks (insert public, lecture via agent owner)
-- NOTE: pas de user_id direct, proposal_id peut être NULL
-- ============================================================
DROP POLICY IF EXISTS "booking_link_clicks_all" ON public.booking_link_clicks;
DROP POLICY IF EXISTS "Anyone can create booking clicks" ON public.booking_link_clicks;
DROP POLICY IF EXISTS "Users view their booking clicks" ON public.booking_link_clicks;
DROP POLICY IF EXISTS "booking_link_clicks_select" ON public.booking_link_clicks;
DROP POLICY IF EXISTS "booking_link_clicks_insert" ON public.booking_link_clicks;

CREATE POLICY "booking_link_clicks_select"
  ON public.booking_link_clicks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agents
      WHERE id = booking_link_clicks.agent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "booking_link_clicks_insert"
  ON public.booking_link_clicks FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- campaigns
-- ============================================================
DROP POLICY IF EXISTS "campaigns_all" ON public.campaigns;
DROP POLICY IF EXISTS "Users manage their campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete" ON public.campaigns;

CREATE POLICY "campaigns_select"
  ON public.campaigns FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.campaign_teams ct ON ct.team_id = tm.team_id
      WHERE ct.campaign_id = campaigns.id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "campaigns_insert"
  ON public.campaigns FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_update"
  ON public.campaigns FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_delete"
  ON public.campaigns FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- campaign_recipients (pas de user_id, accès via campaign)
-- ============================================================
DROP POLICY IF EXISTS "campaign_recipients_all" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users manage their campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "campaign_recipients_select" ON public.campaign_recipients;
DROP POLICY IF EXISTS "campaign_recipients_insert" ON public.campaign_recipients;
DROP POLICY IF EXISTS "campaign_recipients_update" ON public.campaign_recipients;
DROP POLICY IF EXISTS "campaign_recipients_delete" ON public.campaign_recipients;

CREATE POLICY "campaign_recipients_select"
  ON public.campaign_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_recipients.campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_recipients_insert"
  ON public.campaign_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_recipients_update"
  ON public.campaign_recipients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_recipients.campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_recipients_delete"
  ON public.campaign_recipients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_recipients.campaign_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- campaign_teams (pas de user_id)
-- ============================================================
DROP POLICY IF EXISTS "campaign_teams_all" ON public.campaign_teams;
DROP POLICY IF EXISTS "Users manage campaign teams" ON public.campaign_teams;
DROP POLICY IF EXISTS "campaign_teams_select" ON public.campaign_teams;
DROP POLICY IF EXISTS "campaign_teams_insert" ON public.campaign_teams;
DROP POLICY IF EXISTS "campaign_teams_delete" ON public.campaign_teams;

CREATE POLICY "campaign_teams_select"
  ON public.campaign_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_teams.campaign_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = campaign_teams.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_teams_insert"
  ON public.campaign_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_teams_delete"
  ON public.campaign_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = campaign_teams.campaign_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- campaign_blacklist
-- ============================================================
DROP POLICY IF EXISTS "campaign_blacklist_all" ON public.campaign_blacklist;
DROP POLICY IF EXISTS "Users manage their blacklist" ON public.campaign_blacklist;
DROP POLICY IF EXISTS "campaign_blacklist_select" ON public.campaign_blacklist;
DROP POLICY IF EXISTS "campaign_blacklist_insert" ON public.campaign_blacklist;
DROP POLICY IF EXISTS "campaign_blacklist_delete" ON public.campaign_blacklist;

CREATE POLICY "campaign_blacklist_select"
  ON public.campaign_blacklist FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "campaign_blacklist_insert"
  ON public.campaign_blacklist FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaign_blacklist_delete"
  ON public.campaign_blacklist FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- stats_daily
-- ============================================================
DROP POLICY IF EXISTS "stats_daily_all" ON public.stats_daily;
DROP POLICY IF EXISTS "Users view their stats" ON public.stats_daily;
DROP POLICY IF EXISTS "stats_daily_select" ON public.stats_daily;
DROP POLICY IF EXISTS "stats_daily_insert" ON public.stats_daily;
DROP POLICY IF EXISTS "stats_daily_update" ON public.stats_daily;

CREATE POLICY "stats_daily_select"
  ON public.stats_daily FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "stats_daily_insert"
  ON public.stats_daily FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "stats_daily_update"
  ON public.stats_daily FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- user_alerts
-- ============================================================
DROP POLICY IF EXISTS "user_alerts_all" ON public.user_alerts;
DROP POLICY IF EXISTS "Users manage their alerts" ON public.user_alerts;
DROP POLICY IF EXISTS "user_alerts_select" ON public.user_alerts;
DROP POLICY IF EXISTS "user_alerts_insert" ON public.user_alerts;
DROP POLICY IF EXISTS "user_alerts_update" ON public.user_alerts;
DROP POLICY IF EXISTS "user_alerts_delete" ON public.user_alerts;

CREATE POLICY "user_alerts_select"
  ON public.user_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_alerts_insert"
  ON public.user_alerts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_alerts_update"
  ON public.user_alerts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_alerts_delete"
  ON public.user_alerts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- payment_history (lecture seule par le propriétaire)
-- ============================================================
DROP POLICY IF EXISTS "payment_history_all" ON public.payment_history;
DROP POLICY IF EXISTS "Users view their payments" ON public.payment_history;
DROP POLICY IF EXISTS "payment_history_select" ON public.payment_history;

CREATE POLICY "payment_history_select"
  ON public.payment_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- webhook_logs (pas de user_id — accès via session owner)
-- ============================================================
DROP POLICY IF EXISTS "webhook_logs_all" ON public.webhook_logs;
DROP POLICY IF EXISTS "Users view their webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_select" ON public.webhook_logs;

CREATE POLICY "webhook_logs_select"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (
    session_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_sessions
      WHERE id = webhook_logs.session_id AND user_id = auth.uid()
    )
  );
