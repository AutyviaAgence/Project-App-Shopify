-- =====================================================================
--  MIGRATION — Table whatsapp_templates (modèles de messages WABA)
--  Date : 2026-06-09
--
--  Stocke localement les templates créés par l'utilisateur, leur contenu
--  et leur statut Meta (PENDING/APPROVED/REJECTED). Le template vit aussi
--  côté Meta (créé via Graph API) ; cette table est le miroir local.
--
--  Transactionnel : ROLLBACK total en cas d'erreur.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  -- Identité Meta
  meta_id         TEXT,                 -- id du template côté Meta
  name            TEXT NOT NULL,        -- nom technique (a-z, 0-9, _)
  language        TEXT NOT NULL DEFAULT 'fr',
  category        TEXT NOT NULL DEFAULT 'UTILITY',  -- MARKETING | UTILITY | AUTHENTICATION
  -- Contenu
  body_text       TEXT NOT NULL,        -- corps avec variables {{1}}, {{2}}…
  header_text     TEXT,                 -- en-tête texte optionnel
  footer_text     TEXT,                 -- pied de page optionnel
  variables_count INTEGER DEFAULT 0,    -- nombre de variables {{n}}
  sample_values   TEXT[],               -- exemples pour la soumission Meta
  -- Statut
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|pending|approved|rejected
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_user ON whatsapp_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_templates_name_lang
  ON whatsapp_templates(user_id, name, language);

-- RLS user-only
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON whatsapp_templates FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
-- Accès service_role (webhooks/cron)
CREATE POLICY "service_all" ON whatsapp_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
