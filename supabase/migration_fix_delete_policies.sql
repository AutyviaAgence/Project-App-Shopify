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
