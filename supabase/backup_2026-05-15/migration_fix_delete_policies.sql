-- Migration: Corriger les policies DELETE manquantes
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Sessions WhatsApp - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own sessions" ON whatsapp_sessions;
CREATE POLICY "Users can delete own sessions" ON whatsapp_sessions
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 2. Campaigns - Vérifier/Corriger DELETE policy
-- =============================================

-- La policy "Users can manage own campaigns" est FOR ALL, donc DELETE devrait marcher
-- Mais on va s'assurer qu'elle existe
DROP POLICY IF EXISTS "Users can manage own campaigns" ON campaigns;
CREATE POLICY "Users can manage own campaigns" ON campaigns
  FOR ALL USING (user_id = auth.uid());

-- =============================================
-- 3. Agents IA - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own agents" ON ai_agents;
CREATE POLICY "Users can delete own agents" ON ai_agents
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 4. Knowledge Documents - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own documents" ON knowledge_documents;
CREATE POLICY "Users can delete own documents" ON knowledge_documents
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 5. WA Links - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own links" ON wa_links;
CREATE POLICY "Users can delete own links" ON wa_links
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 6. Tags - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own tags" ON conversation_tags;
CREATE POLICY "Users can delete own tags" ON conversation_tags
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 7. Stats Daily - Ajouter policies complètes
-- =============================================

-- INSERT pour créer des stats
DROP POLICY IF EXISTS "Users can insert own stats" ON stats_daily;
CREATE POLICY "Users can insert own stats" ON stats_daily
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE pour mettre à jour les stats
DROP POLICY IF EXISTS "Users can update own stats" ON stats_daily;
CREATE POLICY "Users can update own stats" ON stats_daily
  FOR UPDATE USING (user_id = auth.uid());

-- DELETE pour supprimer les stats
DROP POLICY IF EXISTS "Users can delete own stats" ON stats_daily;
CREATE POLICY "Users can delete own stats" ON stats_daily
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- 8. Contacts - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;
CREATE POLICY "Users can delete own contacts" ON contacts
  FOR DELETE USING (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid())
  );

-- =============================================
-- 9. Conversations - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;
CREATE POLICY "Users can delete own conversations" ON conversations
  FOR DELETE USING (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid())
  );

-- =============================================
-- 10. Messages - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete own messages" ON messages;
CREATE POLICY "Users can delete own messages" ON messages
  FOR DELETE USING (
    session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid())
  );

-- =============================================
-- 11. Campaign Recipients - Ajouter DELETE policy
-- =============================================

-- Les users doivent pouvoir supprimer les recipients de leurs campagnes
DROP POLICY IF EXISTS "Users can delete campaign recipients" ON campaign_recipients;
CREATE POLICY "Users can delete campaign recipients" ON campaign_recipients
  FOR DELETE USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  );

-- =============================================
-- 12. Campaign Blacklist - Ajouter DELETE policy
-- =============================================

DROP POLICY IF EXISTS "Users can delete from blacklist" ON campaign_blacklist;
CREATE POLICY "Users can delete from blacklist" ON campaign_blacklist
  FOR DELETE USING (user_id = auth.uid());
