-- ============================================================
-- RESTAURATION EXACTE DES POLICIES DEPUIS LE BACKUP 2026-04-28
-- + ajout des policies email (nouvelles tables non présentes dans le backup)
-- ============================================================

-- ============================================================
-- FONCTIONS HELPERS (restauration exacte depuis backup)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'accepted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
      AND status = 'accepted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_team_access(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN is_team_member(p_team_id);
END;
$$;

-- GRANT EXECUTE requis pour que les policies RLS puissent appeler ces fonctions
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_team_access(uuid) TO authenticated;

-- ============================================================
-- SUPPRESSION DE TOUTES LES POLICIES ACTUELLES
-- ============================================================

DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- RESTAURATION EXACTE DES POLICIES DU BACKUP
-- ============================================================

-- tenants
CREATE POLICY "Allow public read on tenants" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "Only service role can delete tenants" ON public.tenants FOR DELETE USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Only service role can insert tenants" ON public.tenants FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Only service role can update tenants" ON public.tenants FOR UPDATE USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));

-- onboarding_configs
CREATE POLICY "Service role full access" ON public.onboarding_configs USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Users can insert own config" ON public.onboarding_configs FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can manage own onboarding config" ON public.onboarding_configs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own config" ON public.onboarding_configs FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own config" ON public.onboarding_configs FOR UPDATE USING ((auth.uid() = user_id));

-- campaign_opt_out_keywords
CREATE POLICY "Authenticated can read opt-out keywords" ON public.campaign_opt_out_keywords FOR SELECT TO authenticated USING (true);

-- profiles
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own and team profiles" ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT tm2.user_id
   FROM (public.team_members tm
     JOIN public.team_members tm2 ON (((tm2.team_id = tm.team_id) AND (tm2.status = 'accepted'::text))))
  WHERE ((tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text))))));
CREATE POLICY "Webhook can view profiles" ON public.profiles FOR SELECT TO service_role USING (true);

-- teams
CREATE POLICY "Users can delete teams" ON public.teams FOR DELETE TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert teams" ON public.teams FOR INSERT TO authenticated WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update teams" ON public.teams FOR UPDATE TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view teams" ON public.teams FOR SELECT TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR public.user_has_team_access(id)));

-- team_members
CREATE POLICY "Admins can invite members" ON public.team_members FOR INSERT WITH CHECK ((public.is_team_admin(team_id) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (role = 'owner'::text) AND (EXISTS ( SELECT 1
   FROM public.teams
  WHERE ((teams.id = team_members.team_id) AND (teams.owner_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Users can delete members" ON public.team_members FOR DELETE TO authenticated USING (((role <> 'owner'::text) AND ((user_id = ( SELECT auth.uid() AS uid)) OR public.is_team_admin(team_id))));
CREATE POLICY "Users can update members" ON public.team_members FOR UPDATE TO authenticated USING (((public.is_team_admin(team_id) AND (NOT ((role = 'owner'::text) AND (user_id = ( SELECT auth.uid() AS uid))))) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text))));
CREATE POLICY "Users can view members" ON public.team_members FOR SELECT TO authenticated USING ((public.is_team_member(team_id) OR ((invitation_token IS NOT NULL) AND (status = 'pending'::text) AND (user_id IS NULL))));

-- team_invitations
CREATE POLICY "Admins can delete invitations" ON public.team_invitations FOR DELETE TO authenticated USING ((public.is_team_admin(team_id) AND (used_by IS NULL)));
CREATE POLICY "Admins can insert invitations" ON public.team_invitations FOR INSERT TO authenticated WITH CHECK (public.is_team_admin(team_id));
CREATE POLICY "Admins can update invitations" ON public.team_invitations FOR UPDATE TO authenticated USING (public.is_team_admin(team_id));
CREATE POLICY "Users can view invitations" ON public.team_invitations FOR SELECT TO authenticated USING ((public.is_team_admin(team_id) OR ((used_by IS NULL) AND ((expires_at IS NULL) OR (expires_at > now())))));

-- whatsapp_sessions
CREATE POLICY "Users can delete sessions" ON public.whatsapp_sessions FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert sessions" ON public.whatsapp_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update sessions" ON public.whatsapp_sessions FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));
CREATE POLICY "Users can view sessions" ON public.whatsapp_sessions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));

-- email_sessions (nouvelles — pas dans le backup)
CREATE POLICY "Users can manage their email sessions" ON public.email_sessions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- email_session_teams (nouvelle table)
CREATE POLICY "email_session_teams_all" ON public.email_session_teams FOR ALL TO authenticated
USING (email_session_id IN (SELECT id FROM public.email_sessions WHERE user_id = auth.uid()))
WITH CHECK (email_session_id IN (SELECT id FROM public.email_sessions WHERE user_id = auth.uid()));

-- canned_responses (nouvelle table)
CREATE POLICY "Users can manage their canned responses" ON public.canned_responses USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- ai_agents
CREATE POLICY "Users can delete agents" ON public.ai_agents FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));
CREATE POLICY "Users can insert agents" ON public.ai_agents FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update agents" ON public.ai_agents FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));
CREATE POLICY "Users can view agents" ON public.ai_agents FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));

-- qualifier_routes
CREATE POLICY "Users can manage qualifier routes via agent ownership" ON public.qualifier_routes USING ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE (ai_agents.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE (ai_agents.user_id = ( SELECT auth.uid() AS uid)))));

-- oauth_credentials
CREATE POLICY "Users can manage own credentials" ON public.oauth_credentials USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

-- agent_tools
CREATE POLICY "Users can delete tools" ON public.agent_tools FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert tools" ON public.agent_tools FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update tools" ON public.agent_tools FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text) AND ((team_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (team_members.can_manage_agents = true))))))))));
CREATE POLICY "Users can view tools" ON public.agent_tools FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text) AND ((team_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (team_members.can_manage_agents = true))))))))));

-- tool_execution_logs
CREATE POLICY "Users can insert tool logs" ON public.tool_execution_logs FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view tool logs" ON public.tool_execution_logs FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text) AND ((team_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (team_members.can_manage_agents = true))))))))));

-- contacts (whatsapp)
CREATE POLICY "Users can delete contacts" ON public.contacts FOR DELETE TO authenticated USING ((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text)))))))));
CREATE POLICY "Users can update contacts" ON public.contacts FOR UPDATE TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text)))))))));
CREATE POLICY "Users can view contacts" ON public.contacts FOR SELECT TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text)))))))));
-- contacts email (ajout)
CREATE POLICY "Users can view email contacts" ON public.contacts FOR SELECT USING ((email_session_id IN ( SELECT email_sessions.id
   FROM public.email_sessions
  WHERE (email_sessions.user_id = auth.uid()))));

-- conversation_tags
CREATE POLICY "Users can create tags" ON public.conversation_tags FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can delete tags" ON public.conversation_tags FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update tags" ON public.conversation_tags FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view tags" ON public.conversation_tags FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (user_id IN ( SELECT tm2.user_id
   FROM (public.team_members tm
     JOIN public.team_members tm2 ON (((tm2.team_id = tm.team_id) AND (tm2.status = 'accepted'::text))))
  WHERE ((tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text))))));

-- lifecycle_stages
CREATE POLICY "lifecycle_stages_delete" ON public.lifecycle_stages FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "lifecycle_stages_insert" ON public.lifecycle_stages FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "lifecycle_stages_select" ON public.lifecycle_stages FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "lifecycle_stages_update" ON public.lifecycle_stages FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

-- conversations (whatsapp)
CREATE POLICY "Users can delete conversations" ON public.conversations FOR DELETE TO authenticated USING ((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_send_messages = true))))))))));
CREATE POLICY "Users can update conversations" ON public.conversations FOR UPDATE TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_view_messages = true))))))))));
CREATE POLICY "Users can view conversations" ON public.conversations FOR SELECT TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_view_messages = true))))))))));
-- conversations email (ajout)
CREATE POLICY "Users can view their email conversations" ON public.conversations FOR SELECT USING ((email_session_id IN ( SELECT email_sessions.id
   FROM public.email_sessions
  WHERE (email_sessions.user_id = auth.uid()))));

-- conversation_tag_assignments
CREATE POLICY "Users can view tag assignments" ON public.conversation_tag_assignments FOR SELECT TO authenticated USING ((conversation_id IN ( SELECT c.id
   FROM (public.conversations c
     JOIN public.whatsapp_sessions ws ON ((ws.id = c.session_id)))
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (ws.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));

-- lifecycle_history
CREATE POLICY "lifecycle_history_insert" ON public.lifecycle_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = lifecycle_history.conversation_id) AND (c.session_id IN ( SELECT whatsapp_sessions.id
           FROM public.whatsapp_sessions
          WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "lifecycle_history_select" ON public.lifecycle_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = lifecycle_history.conversation_id) AND (c.session_id IN ( SELECT whatsapp_sessions.id
           FROM public.whatsapp_sessions
          WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid))))))));

-- messages (whatsapp)
CREATE POLICY "Users can delete messages" ON public.messages FOR DELETE TO authenticated USING ((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_send_messages = true))))))))));
CREATE POLICY "Users can update messages" ON public.messages FOR UPDATE TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_send_messages = true))))))))));
CREATE POLICY "Users can view messages" ON public.messages FOR SELECT TO authenticated USING ((session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.user_id = ( SELECT auth.uid() AS uid)) OR ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_view_messages = true))))))))));
-- messages email (ajout)
CREATE POLICY "Users can view their email messages" ON public.messages FOR SELECT USING ((conversation_id IN ( SELECT conversations.id
   FROM public.conversations
  WHERE (conversations.email_session_id IN ( SELECT email_sessions.id
           FROM public.email_sessions
          WHERE (email_sessions.user_id = auth.uid()))))));
-- messages webhook
CREATE POLICY "Webhook can view messages" ON public.messages FOR SELECT TO service_role USING (true);

-- knowledge_documents
CREATE POLICY "Users can delete documents" ON public.knowledge_documents FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert documents" ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update documents" ON public.knowledge_documents FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));
CREATE POLICY "Users can view documents" ON public.knowledge_documents FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND public.user_has_team_access(team_id))));

-- knowledge_chunks
CREATE POLICY "Users can delete chunks" ON public.knowledge_chunks FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert chunks" ON public.knowledge_chunks FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view chunks" ON public.knowledge_chunks FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (document_id IN ( SELECT knowledge_documents.id
   FROM public.knowledge_documents
  WHERE ((knowledge_documents.team_id IS NOT NULL) AND (knowledge_documents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text) AND ((team_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (team_members.can_view_knowledge = true))))))))));

-- agent_knowledge_documents
CREATE POLICY "Users can delete own agent documents" ON public.agent_knowledge_documents FOR DELETE TO authenticated USING ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND public.user_has_team_access(ai_agents.team_id))))));
CREATE POLICY "Users can insert own agent documents" ON public.agent_knowledge_documents FOR INSERT TO authenticated WITH CHECK ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND public.user_has_team_access(ai_agents.team_id))))));
CREATE POLICY "Users can view own agent documents" ON public.agent_knowledge_documents FOR SELECT TO authenticated USING (((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND public.user_has_team_access(ai_agents.team_id))))) OR (document_id IN ( SELECT knowledge_documents.id
   FROM public.knowledge_documents
  WHERE ((knowledge_documents.user_id = ( SELECT auth.uid() AS uid)) OR ((knowledge_documents.team_id IS NOT NULL) AND public.user_has_team_access(knowledge_documents.team_id)))))));
CREATE POLICY "Webhook can view agent docs" ON public.agent_knowledge_documents FOR SELECT TO anon, service_role USING (true);

-- agent_teams
CREATE POLICY "Users can delete agent_teams" ON public.agent_teams FOR DELETE TO authenticated USING ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE (ai_agents.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert agent_teams" ON public.agent_teams FOR INSERT TO authenticated WITH CHECK ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE (ai_agents.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view agent_teams" ON public.agent_teams FOR SELECT TO authenticated USING (((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE (ai_agents.user_id = ( SELECT auth.uid() AS uid)))) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text))))));

-- document_teams
CREATE POLICY "Users can delete document_teams" ON public.document_teams FOR DELETE TO authenticated USING ((document_id IN ( SELECT knowledge_documents.id
   FROM public.knowledge_documents
  WHERE (knowledge_documents.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert document_teams" ON public.document_teams FOR INSERT TO authenticated WITH CHECK ((document_id IN ( SELECT knowledge_documents.id
   FROM public.knowledge_documents
  WHERE (knowledge_documents.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view document_teams" ON public.document_teams FOR SELECT TO authenticated USING (((document_id IN ( SELECT knowledge_documents.id
   FROM public.knowledge_documents
  WHERE (knowledge_documents.user_id = ( SELECT auth.uid() AS uid)))) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text))))));

-- session_teams
CREATE POLICY "Users can delete session_teams" ON public.session_teams FOR DELETE TO authenticated USING ((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert session_teams" ON public.session_teams FOR INSERT TO authenticated WITH CHECK ((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view session_teams" ON public.session_teams FOR SELECT TO authenticated USING (((session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE (whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)))) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text))))));

-- wa_links
CREATE POLICY "Users can delete links" ON public.wa_links FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert links" ON public.wa_links FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update links" ON public.wa_links FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.team_id = wa_links.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_manage_links = true))))))));
CREATE POLICY "Users can view links" ON public.wa_links FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))));

-- link_teams
CREATE POLICY "Users can delete link_teams" ON public.link_teams FOR DELETE TO authenticated USING ((link_id IN ( SELECT wa_links.id
   FROM public.wa_links
  WHERE (wa_links.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert link_teams" ON public.link_teams FOR INSERT TO authenticated WITH CHECK ((link_id IN ( SELECT wa_links.id
   FROM public.wa_links
  WHERE (wa_links.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view link_teams" ON public.link_teams FOR SELECT TO authenticated USING (((link_id IN ( SELECT wa_links.id
   FROM public.wa_links
  WHERE (wa_links.user_id = ( SELECT auth.uid() AS uid)))) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text))))));

-- link_clicks
CREATE POLICY "Users can delete link clicks" ON public.link_clicks FOR DELETE TO authenticated USING ((link_id IN ( SELECT wa_links.id
   FROM public.wa_links
  WHERE (wa_links.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view link clicks" ON public.link_clicks FOR SELECT TO authenticated USING ((link_id IN ( SELECT wa_links.id
   FROM public.wa_links
  WHERE ((wa_links.user_id = ( SELECT auth.uid() AS uid)) OR ((wa_links.team_id IS NOT NULL) AND (wa_links.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));

-- booking_proposals
CREATE POLICY "Users can insert booking proposals" ON public.booking_proposals FOR INSERT TO authenticated WITH CHECK ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));
CREATE POLICY "Users can update booking proposals" ON public.booking_proposals FOR UPDATE TO authenticated USING ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));
CREATE POLICY "Users can view booking proposals" ON public.booking_proposals FOR SELECT TO authenticated USING ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));

-- booking_link_clicks
CREATE POLICY "Users can insert booking clicks" ON public.booking_link_clicks FOR INSERT TO authenticated WITH CHECK ((agent_id IN ( SELECT ai_agents.id
   FROM public.ai_agents
  WHERE ((ai_agents.user_id = ( SELECT auth.uid() AS uid)) OR ((ai_agents.team_id IS NOT NULL) AND (ai_agents.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));

-- campaigns
CREATE POLICY "Users can delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id IS NOT NULL) AND (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))));

-- campaign_recipients
CREATE POLICY "Users can delete campaign recipients" ON public.campaign_recipients FOR DELETE TO authenticated USING ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert campaign recipients" ON public.campaign_recipients FOR INSERT TO authenticated WITH CHECK ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update campaign recipients" ON public.campaign_recipients FOR UPDATE TO authenticated USING ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view campaign recipients" ON public.campaign_recipients FOR SELECT TO authenticated USING ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE ((campaigns.user_id = ( SELECT auth.uid() AS uid)) OR ((campaigns.team_id IS NOT NULL) AND (campaigns.team_id IN ( SELECT team_members.team_id
           FROM public.team_members
          WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text)))))))));

-- campaign_teams
CREATE POLICY "Users can delete campaign_teams" ON public.campaign_teams FOR DELETE TO authenticated USING ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert campaign_teams" ON public.campaign_teams FOR INSERT TO authenticated WITH CHECK ((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view campaign_teams" ON public.campaign_teams FOR SELECT TO authenticated USING (((campaign_id IN ( SELECT campaigns.id
   FROM public.campaigns
  WHERE (campaigns.user_id = ( SELECT auth.uid() AS uid)))) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE ((team_members.user_id = ( SELECT auth.uid() AS uid)) AND (team_members.status = 'accepted'::text))))));

-- campaign_blacklist
CREATE POLICY "Users can delete from blacklist" ON public.campaign_blacklist FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert own blacklist" ON public.campaign_blacklist FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own blacklist" ON public.campaign_blacklist FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Webhook can view blacklist" ON public.campaign_blacklist FOR SELECT TO anon, service_role USING (true);

-- campaign_opt_out_keywords
CREATE POLICY "Webhook can view keywords" ON public.campaign_opt_out_keywords FOR SELECT TO anon, service_role USING (true);

-- stats_daily
CREATE POLICY "Users can delete stats" ON public.stats_daily FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert stats" ON public.stats_daily FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update stats" ON public.stats_daily FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view stats" ON public.stats_daily FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (session_id IN ( SELECT ws.id
   FROM public.whatsapp_sessions ws
  WHERE ((ws.team_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM public.team_members tm
          WHERE ((tm.team_id = ws.team_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status = 'accepted'::text) AND ((tm.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (tm.can_view_stats = true))))))))));

-- user_alerts
CREATE POLICY "Users can delete own alerts" ON public.user_alerts FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update own alerts" ON public.user_alerts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own alerts" ON public.user_alerts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

-- payment_history
CREATE POLICY "Users can view payment history" ON public.payment_history FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

-- webhook_logs
CREATE POLICY "Users can delete webhook logs" ON public.webhook_logs FOR DELETE TO authenticated USING (((session_id IS NULL) OR (session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE ((whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)) OR ((whatsapp_sessions.team_id IS NOT NULL) AND public.user_has_team_access(whatsapp_sessions.team_id)))))));
CREATE POLICY "Users can view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING (((session_id IS NULL) OR (session_id IN ( SELECT whatsapp_sessions.id
   FROM public.whatsapp_sessions
  WHERE ((whatsapp_sessions.user_id = ( SELECT auth.uid() AS uid)) OR ((whatsapp_sessions.team_id IS NOT NULL) AND public.user_has_team_access(whatsapp_sessions.team_id)))))));
CREATE POLICY "Webhook can view logs" ON public.webhook_logs FOR SELECT TO service_role USING (true);

-- ============================================================
-- ACTIVATION RLS SUR TOUTES LES TABLES
-- ============================================================

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_opt_out_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualifier_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
