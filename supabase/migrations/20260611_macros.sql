-- =====================================================================
--  MIGRATION — Macros (réponses pré-enregistrées)
--  Date : 2026-06-11
--
--  Une macro = un message type réutilisable, insérable en 1 clic dans une
--  conversation. Brique de productivité agent (équivalent Gorgias macros).
--  Variables supportées dans le contenu : {contact_name}, {first_name}.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS macros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,                    -- nom court affiché dans le sélecteur
  shortcut    TEXT,                             -- raccourci optionnel (ex: "/merci")
  content     TEXT NOT NULL,                    -- le texte inséré
  category    TEXT DEFAULT 'general',           -- regroupement (general, sav, livraison...)
  usage_count INTEGER NOT NULL DEFAULT 0,       -- compteur d'utilisation (tri par popularité)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_macros_user ON macros(user_id);

ALTER TABLE macros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "macros_owner" ON macros;
CREATE POLICY "macros_owner" ON macros
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
