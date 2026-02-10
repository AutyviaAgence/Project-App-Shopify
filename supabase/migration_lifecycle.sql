-- =============================================
-- Migration: Lifecycle System
-- Système de classification IA des conversations
-- =============================================

-- Table: lifecycle_stages — Stades définis par l'utilisateur
CREATE TABLE IF NOT EXISTS lifecycle_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT DEFAULT NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Table: lifecycle_history — Historique des transitions
CREATE TABLE IF NOT EXISTS lifecycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  reason TEXT DEFAULT NULL,
  changed_by TEXT NOT NULL DEFAULT 'ai',
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ALTER conversations — Ajouter le stage actuel + compteur
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lifecycle_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lifecycle_last_analyzed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lifecycle_messages_since_analysis INT DEFAULT 0;

-- ALTER profiles — Seuil d'analyse configurable
-- NULL = analyse manuelle uniquement, 1 = chaque message, 3, 5, 10
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lifecycle_analysis_threshold INT DEFAULT NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_lifecycle_stages_user_id ON lifecycle_stages(user_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_history_conversation_id ON lifecycle_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lifecycle_stage_id ON conversations(lifecycle_stage_id);

-- =============================================
-- GRANT permissions (requis pour que service_role et authenticated puissent accéder)
-- =============================================

GRANT ALL ON lifecycle_stages TO authenticated;
GRANT ALL ON lifecycle_stages TO service_role;
GRANT ALL ON lifecycle_history TO authenticated;
GRANT ALL ON lifecycle_history TO service_role;

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE lifecycle_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_history ENABLE ROW LEVEL SECURITY;

-- lifecycle_stages: l'utilisateur peut tout faire sur ses propres stages
CREATE POLICY "lifecycle_stages_select" ON lifecycle_stages FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_insert" ON lifecycle_stages FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_update" ON lifecycle_stages FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "lifecycle_stages_delete" ON lifecycle_stages FOR DELETE
  USING (user_id = auth.uid());

-- lifecycle_history: visible si la conversation appartient à une session de l'utilisateur
CREATE POLICY "lifecycle_history_select" ON lifecycle_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE c.id = lifecycle_history.conversation_id
      AND ws.user_id = auth.uid()
    )
  );

CREATE POLICY "lifecycle_history_insert" ON lifecycle_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions ws ON ws.id = c.session_id
      WHERE c.id = lifecycle_history.conversation_id
      AND ws.user_id = auth.uid()
    )
  );
