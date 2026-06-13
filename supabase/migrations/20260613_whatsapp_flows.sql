-- =====================================================================
--  MIGRATION — WhatsApp Flows (formulaires multi-écrans, mode "navigate")
--  Date : 2026-06-13
--
--  Un Flow = un formulaire interactif multi-écrans envoyé dans WhatsApp.
--  Mode "navigate" (statique) : pas d'endpoint chiffré, les écrans sont
--  prédéfinis et la réponse finale arrive en une fois (webhook nfm_reply).
--
--  screens : définition des écrans (JSON) éditée dans l'app puis compilée en
--    Flow JSON Meta à la publication. Format d'un écran :
--      { id, title, fields: [ { name, label, type, required, options? } ] }
--    type ∈ text | textarea | radio | checkbox | dropdown
--  meta_flow_id : ID du Flow côté Meta (après création).
--  status : draft | published (publié = utilisable à l'envoi).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  -- Texte du bouton/CTA qui ouvre le flow (ex : « Remplir le formulaire »)
  cta_text      TEXT NOT NULL DEFAULT 'Ouvrir',
  -- Message d'accompagnement (corps du message qui contient le bouton flow)
  body_text     TEXT NOT NULL DEFAULT '',
  screens       JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_flow_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_user ON whatsapp_flows(user_id);

ALTER TABLE whatsapp_flows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY owner_all ON whatsapp_flows
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_all ON whatsapp_flows
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
