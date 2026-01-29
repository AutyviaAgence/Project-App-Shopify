-- Migration: Mise à jour des RLS pour conversations, messages et contacts
-- Pour supporter l'accès par équipe
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Contacts (via session ownership + team)
-- =============================================
DROP POLICY IF EXISTS "Users can view contacts of own sessions" ON contacts;
DROP POLICY IF EXISTS "Users can view contacts of sessions" ON contacts;
CREATE POLICY "Users can view contacts of sessions" ON contacts
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

DROP POLICY IF EXISTS "Users can manage contacts of own sessions" ON contacts;
DROP POLICY IF EXISTS "Users can manage contacts of sessions" ON contacts;
CREATE POLICY "Users can manage contacts of sessions" ON contacts
  FOR ALL USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- =============================================
-- 2. Conversations (via session ownership + team)
-- =============================================
DROP POLICY IF EXISTS "Users can view conversations of own sessions" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations of sessions" ON conversations;
CREATE POLICY "Users can view conversations of sessions" ON conversations
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

DROP POLICY IF EXISTS "Users can manage conversations of own sessions" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations of sessions" ON conversations;
CREATE POLICY "Users can manage conversations of sessions" ON conversations
  FOR ALL USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- =============================================
-- 3. Messages (via session ownership + team)
-- =============================================
DROP POLICY IF EXISTS "Users can view messages of own sessions" ON messages;
DROP POLICY IF EXISTS "Users can view messages of sessions" ON messages;
CREATE POLICY "Users can view messages of sessions" ON messages
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

DROP POLICY IF EXISTS "Users can insert messages for own sessions" ON messages;
DROP POLICY IF EXISTS "Users can insert messages for sessions" ON messages;
CREATE POLICY "Users can insert messages for sessions" ON messages
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

DROP POLICY IF EXISTS "Users can update messages for sessions" ON messages;
CREATE POLICY "Users can update messages for sessions" ON messages
  FOR UPDATE USING (
    session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );
