-- =====================================================================
--  MIGRATION — Dossiers pour ranger les workflows d'automatisation
--  Date : 2026-07-06
--
--  Permet au marchand de créer des dossiers (ex : « Commandes », « Marketing »,
--  « SAV ») et d'y glisser ses workflows. Un workflow sans dossier reste dans
--  « Non classés ». RLS propriétaire (comme automations).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS automation_folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_folders_user ON automation_folders (user_id, position);

-- Lien workflow → dossier (SET NULL si le dossier est supprimé → « Non classés »).
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES automation_folders(id) ON DELETE SET NULL;

-- RLS : propriétaire uniquement + service_role.
ALTER TABLE automation_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_all" ON automation_folders;
CREATE POLICY "owner_all" ON automation_folders FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "service_all" ON automation_folders;
CREATE POLICY "service_all" ON automation_folders FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
