-- =====================================================================
--  MIGRATION — Retrait complet du système d'ÉQUIPES (Teams)
--  Date : 2026-06-09
--  Cible : Supabase self-hosted (VPS)
--
--  ⚠️  À RELIRE AVANT APPLICATION. Backup pris :
--      migration/backup_20260609_pre_teams_removal.sql (~130 MB)
--
--  Ce script :
--   1. Réécrit toutes les policies "team-aware" en versions user-only
--      (DROP + CREATE par table, basé sur le chemin de propriété réel)
--   2. Supprime les fonctions teams
--   3. Supprime les tables teams + tables de liaison *_teams
--   4. Supprime les colonnes team_id
--
--  Tout est dans UNE transaction : en cas d'erreur, ROLLBACK total.
--  Exécuter avec : psql "<conn>" -v ON_ERROR_STOP=1 -f 20260609_remove_teams.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. RÉÉCRITURE DES POLICIES → user-only
--
--    Approche robuste : on DROP automatiquement TOUTES les policies
--    dont la définition (qual/with_check) mentionne "team" — sur les
--    tables authenticated — puis on recrée des policies user-only.
--    Les policies "Webhook can view" (service_role/anon, qual=true,
--    sans 'team') sont AUTOMATIQUEMENT PRÉSERVÉES.
-- ---------------------------------------------------------------------

-- 1a. Drop dynamique de toutes les policies team-aware
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '')       ILIKE '%team%'
        OR COALESCE(with_check, '') ILIKE '%team%'
        OR COALESCE(qual, '')    ILIKE '%user_has_team%'
        OR COALESCE(qual, '')    ILIKE '%can_access%'
      )
      -- on ne touche pas aux tables teams elles-mêmes (droppées en section 3)
      AND tablename NOT IN ('teams','team_members','team_invitations',
                            'agent_teams','session_teams','document_teams',
                            'link_teams','campaign_teams','email_session_teams')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Dropped policy % on %', pol.policyname, pol.tablename;
  END LOOP;
END $$;

-- 1b. Recréation des policies user-only

-- Propriété DIRECTE (colonne user_id)
CREATE POLICY "owner_all" ON whatsapp_sessions   FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON ai_agents           FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON wa_links            FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON knowledge_documents FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON campaigns           FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON conversation_tags   FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON knowledge_chunks    FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON agent_tools         FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON tool_execution_logs FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "owner_all" ON stats_daily         FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Via SESSION → user_id
CREATE POLICY "owner_all" ON contacts FOR ALL
  USING      (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON conversations FOR ALL
  USING      (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON messages FOR ALL
  USING      (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON webhook_logs FOR ALL
  USING      (session_id IS NULL OR session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IS NULL OR session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON booking_proposals FOR ALL
  USING      (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON booking_link_clicks FOR ALL
  USING      (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = (SELECT auth.uid())));

-- Via CONVERSATION → session → user_id
CREATE POLICY "owner_all" ON conversation_lifecycle_stages FOR ALL
  USING (conversation_id IN (
    SELECT c.id FROM conversations c JOIN whatsapp_sessions s ON s.id = c.session_id
    WHERE s.user_id = (SELECT auth.uid())))
  WITH CHECK (conversation_id IN (
    SELECT c.id FROM conversations c JOIN whatsapp_sessions s ON s.id = c.session_id
    WHERE s.user_id = (SELECT auth.uid())));
CREATE POLICY "owner_all" ON conversation_tag_assignments FOR ALL
  USING (conversation_id IN (
    SELECT c.id FROM conversations c JOIN whatsapp_sessions s ON s.id = c.session_id
    WHERE s.user_id = (SELECT auth.uid())))
  WITH CHECK (conversation_id IN (
    SELECT c.id FROM conversations c JOIN whatsapp_sessions s ON s.id = c.session_id
    WHERE s.user_id = (SELECT auth.uid())));

-- Via AGENT → user_id
CREATE POLICY "owner_all" ON agent_knowledge_documents FOR ALL
  USING      (agent_id IN (SELECT id FROM ai_agents WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (agent_id IN (SELECT id FROM ai_agents WHERE user_id = (SELECT auth.uid())));

-- Via CAMPAIGN → user_id
CREATE POLICY "owner_all" ON campaign_recipients FOR ALL
  USING      (campaign_id IN (SELECT id FROM campaigns WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE user_id = (SELECT auth.uid())));

-- Via LINK → user_id
CREATE POLICY "owner_all" ON link_clicks FOR ALL
  USING      (link_id IN (SELECT id FROM wa_links WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (link_id IN (SELECT id FROM wa_links WHERE user_id = (SELECT auth.uid())));

-- profiles : la policy "view own and team profiles" est droppée en 1a ;
-- on garantit que l'utilisateur peut voir SON profil.
CREATE POLICY "profiles_self_select" ON profiles FOR SELECT USING (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------
-- 2. SUPPRESSION DES FONCTIONS teams
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS user_has_team_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS user_has_team_permission(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_session(uuid) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_campaign(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_team_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_session_team_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_agent_team_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_document_team_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_link_team_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_campaign_team_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS create_team_owner_member() CASCADE;
DROP FUNCTION IF EXISTS generate_team_join_code() CASCADE;
DROP FUNCTION IF EXISTS set_team_join_code() CASCADE;
DROP FUNCTION IF EXISTS join_team_with_code(text) CASCADE;

-- ---------------------------------------------------------------------
-- 3. SUPPRESSION DES TABLES teams + liaisons
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS agent_teams CASCADE;
DROP TABLE IF EXISTS session_teams CASCADE;
DROP TABLE IF EXISTS document_teams CASCADE;
DROP TABLE IF EXISTS link_teams CASCADE;
DROP TABLE IF EXISTS campaign_teams CASCADE;
DROP TABLE IF EXISTS email_session_teams CASCADE;
DROP TABLE IF EXISTS team_invitations CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- ---------------------------------------------------------------------
-- 4. SUPPRESSION DES COLONNES team_id
-- ---------------------------------------------------------------------
ALTER TABLE ai_agents            DROP COLUMN IF EXISTS team_id;
ALTER TABLE whatsapp_sessions    DROP COLUMN IF EXISTS team_id;
ALTER TABLE knowledge_documents  DROP COLUMN IF EXISTS team_id;
ALTER TABLE wa_links             DROP COLUMN IF EXISTS team_id;
ALTER TABLE conversation_tags    DROP COLUMN IF EXISTS team_id;
ALTER TABLE canned_responses     DROP COLUMN IF EXISTS team_id;
ALTER TABLE oauth_credentials    DROP COLUMN IF EXISTS team_id;
ALTER TABLE campaigns            DROP COLUMN IF EXISTS team_id;
-- email_sessions.team_id : laissé pour la phase "retrait Email"

-- ---------------------------------------------------------------------
-- Vérifs rapides (informationnel, ne bloque pas)
-- ---------------------------------------------------------------------
-- SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual ILIKE '%team%';  -- attendu : 0 (hors email)

COMMIT;

-- =====================================================================
--  Après COMMIT, vérifier côté app :
--   - login OK
--   - liste conversations / messages visible
--   - agents / sessions / campagnes visibles
--  En cas de souci : restaurer le backup pré-migration.
-- =====================================================================
