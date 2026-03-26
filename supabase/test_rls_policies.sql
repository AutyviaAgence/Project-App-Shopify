-- =============================================
-- TEST: Vérification complète des RLS policies
-- Exécuter dans Supabase SQL Editor APRÈS les 2 migrations
-- =============================================

-- 1. Vérifier que TOUTES les tables ont RLS activé (sauf campaign_opt_out_keywords)
SELECT
  schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma%'
ORDER BY tablename;

-- Tables sans RLS (devrait être uniquement campaign_opt_out_keywords) :
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma%';

-- =====a========================================
-- 2. Liste COMPLÈTE de toutes les policies par table
-- =============================================
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  LEFT(qual::text, 120) AS using_clause,
  LEFT(with_check::text, 120) AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- =============================================
-- 3. TESTS CRITIQUES : vérifier qu'il n'y a PLUS de USING(true) / WITH CHECK(true)
-- =============================================
-- Ceci devrait retourner AUCUN résultat après les migrations
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual::text = 'true' THEN 'USING(true) ⚠️'
    ELSE NULL
  END AS using_issue,
  CASE
    WHEN with_check::text = 'true' THEN 'WITH CHECK(true) ⚠️'
    ELSE NULL
  END AS check_issue
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual::text = 'true' OR with_check::text = 'true')
ORDER BY tablename;

-- =============================================
-- 4. TESTS PAR TABLE — Vérifier les policies attendues
-- =============================================

-- 4a. profiles — DOIT avoir policy restrictive, PAS USING(true)
SELECT policyname, cmd, LEFT(qual::text, 200) AS using_clause
FROM pg_policies WHERE tablename = 'profiles'
ORDER BY cmd;

-- 4b. booking_proposals — DOIT avoir 3 policies scopées (SELECT/INSERT/UPDATE)
SELECT policyname, cmd,
  LEFT(qual::text, 100) AS using_clause,
  LEFT(with_check::text, 100) AS check_clause
FROM pg_policies WHERE tablename = 'booking_proposals'
ORDER BY cmd;

-- 4c. campaign_recipients — DOIT avoir 4 policies scopées, PAS de doublons
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'campaign_recipients'
ORDER BY cmd;

-- 4d. booking_link_clicks — INSERT doit être scopé
SELECT policyname, cmd, LEFT(with_check::text, 100) AS check_clause
FROM pg_policies WHERE tablename = 'booking_link_clicks'
ORDER BY cmd;

-- 4e. link_clicks — DOIT avoir SELECT + DELETE
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'link_clicks'
ORDER BY cmd;

-- 4f. stats_daily — SELECT DOIT inclure team access
SELECT policyname, cmd, LEFT(qual::text, 200) AS using_clause
FROM pg_policies WHERE tablename = 'stats_daily'
ORDER BY cmd;

-- 4g. wa_links — DOIT avoir 4 policies séparées (plus de FOR ALL)
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'wa_links'
ORDER BY cmd;

-- 4h. agent_tools — DOIT avoir team access en SELECT/UPDATE
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'agent_tools'
ORDER BY cmd;

-- 4i. tool_execution_logs
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'tool_execution_logs'
ORDER BY cmd;

-- 4j. conversation_tags — SELECT doit inclure team
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'conversation_tags'
ORDER BY cmd;

-- 4k. conversation_tag_assignments — SELECT doit inclure team via sessions
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'conversation_tag_assignments'
ORDER BY cmd;

-- 4l. knowledge_chunks — SELECT doit inclure team avec can_view_knowledge
SELECT policyname, cmd, LEFT(qual::text, 200) AS using_clause
FROM pg_policies WHERE tablename = 'knowledge_chunks'
ORDER BY cmd;

-- 4m. team_invitations — doit vérifier expires_at
SELECT policyname, cmd, LEFT(qual::text, 200) AS using_clause
FROM pg_policies WHERE tablename = 'team_invitations'
ORDER BY cmd;

-- 4n. messages — doit avoir granular permissions (can_view_messages, can_send_messages)
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'messages'
ORDER BY cmd;

-- 4o. conversations — doit avoir granular permissions
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'conversations'
ORDER BY cmd;

-- 4p. contacts — doit avoir granular policies (pas de FOR ALL)
SELECT policyname, cmd
FROM pg_policies WHERE tablename = 'contacts'
ORDER BY cmd;

-- =============================================
-- 5. VÉRIFICATION : aucune policy FOR ALL sur tables critiques
-- =============================================
-- FOR ALL = pas de séparation SELECT/INSERT/UPDATE/DELETE
-- Devrait retourner AUCUN résultat pour les tables critiques
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'ALL'
  AND tablename IN (
    'profiles', 'messages', 'conversations', 'contacts',
    'campaign_recipients', 'booking_proposals', 'booking_link_clicks',
    'wa_links', 'stats_daily', 'link_clicks'
  )
ORDER BY tablename;

-- =============================================
-- 6. RÉSUMÉ : nombre de policies par table
-- =============================================
SELECT
  tablename,
  COUNT(*) AS policy_count,
  STRING_AGG(DISTINCT cmd, ', ' ORDER BY cmd) AS commands
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
