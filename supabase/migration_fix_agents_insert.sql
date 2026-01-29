-- Migration: Ajouter policy INSERT pour ai_agents
-- À exécuter dans Supabase SQL Editor

-- Policy INSERT pour ai_agents
-- Permet à l'utilisateur de créer un agent pour lui-même
-- ou pour une équipe dont il est membre
CREATE POLICY "Users can create agents" ON ai_agents
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR user_has_team_access(team_id)
    )
  );

-- De même pour les autres tables qui pourraient manquer INSERT

-- Sessions WhatsApp
DROP POLICY IF EXISTS "Users can create sessions" ON whatsapp_sessions;
CREATE POLICY "Users can create sessions" ON whatsapp_sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR user_has_team_access(team_id)
    )
  );

-- WA Links
DROP POLICY IF EXISTS "Users can create links" ON wa_links;
CREATE POLICY "Users can create links" ON wa_links
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR user_has_team_access(team_id)
    )
  );

-- Knowledge Documents
DROP POLICY IF EXISTS "Users can create documents" ON knowledge_documents;
CREATE POLICY "Users can create documents" ON knowledge_documents
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR user_has_team_access(team_id)
    )
  );

-- Conversation Tags
DROP POLICY IF EXISTS "Users can create tags" ON conversation_tags;
CREATE POLICY "Users can create tags" ON conversation_tags
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR user_has_team_access(team_id)
    )
  );
