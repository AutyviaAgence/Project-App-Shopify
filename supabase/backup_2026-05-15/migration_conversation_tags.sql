-- Migration: Tags/Labels pour les conversations
-- À exécuter dans Supabase SQL Editor

-- Table des tags disponibles
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1', -- couleur hex
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Table de jonction conversation <-> tags
CREATE TABLE IF NOT EXISTS conversation_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES conversation_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, tag_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_conversation_tags_user ON conversation_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_conversation ON conversation_tag_assignments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag ON conversation_tag_assignments(tag_id);

-- RLS
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Policies pour conversation_tags
CREATE POLICY "Users can view own tags"
  ON conversation_tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tags"
  ON conversation_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON conversation_tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON conversation_tags FOR DELETE
  USING (auth.uid() = user_id);

-- Policies pour conversation_tag_assignments
-- Un utilisateur peut assigner des tags à ses conversations
CREATE POLICY "Users can view tag assignments for their conversations"
  ON conversation_tag_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_tag_assignments.conversation_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tag assignments for their conversations"
  ON conversation_tag_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_tag_assignments.conversation_id
      AND s.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM conversation_tags t
      WHERE t.id = conversation_tag_assignments.tag_id
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag assignments for their conversations"
  ON conversation_tag_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_tag_assignments.conversation_id
      AND s.user_id = auth.uid()
    )
  );

-- Tags par défaut (à insérer manuellement par user si nécessaire)
-- INSERT INTO conversation_tags (user_id, name, color) VALUES
--   ('USER_ID', 'Urgent', '#ef4444'),
--   ('USER_ID', 'En attente', '#f59e0b'),
--   ('USER_ID', 'Résolu', '#22c55e'),
--   ('USER_ID', 'Commercial', '#3b82f6'),
--   ('USER_ID', 'Support', '#8b5cf6');
