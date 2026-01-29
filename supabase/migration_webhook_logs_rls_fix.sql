-- Migration: Corriger RLS webhook_logs pour support équipes
-- À exécuter dans Supabase SQL Editor

-- Supprimer l'ancienne policy
DROP POLICY IF EXISTS "Users can view webhook logs for their sessions" ON webhook_logs;

-- Nouvelle policy qui inclut :
-- 1. Logs avec session_id null (orphelins)
-- 2. Logs de sessions personnelles
-- 3. Logs de sessions d'équipe
CREATE POLICY "Users can view webhook logs for their sessions" ON webhook_logs
  FOR SELECT USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );

-- Policy pour DELETE (nettoyage des vieux logs)
DROP POLICY IF EXISTS "Users can delete webhook logs for their sessions" ON webhook_logs;
CREATE POLICY "Users can delete webhook logs for their sessions" ON webhook_logs
  FOR DELETE USING (
    session_id IS NULL
    OR session_id IN (
      SELECT id FROM whatsapp_sessions
      WHERE user_id = auth.uid()
      OR (team_id IS NOT NULL AND user_has_team_access(team_id))
    )
  );
