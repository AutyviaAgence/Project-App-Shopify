-- =====================================================================
--  MIGRATION — Journal détaillé des appels IA (mesure des coûts réels)
--  Date : 2026-07-02
--
--  On loggue CHAQUE appel OpenAI avec sa feature, son modèle, les tokens
--  entrée/sortie et le coût $ calculé. But : mesurer les vrais coûts par
--  fonctionnalité et par "discussion" (au lieu d'estimer) pour caler le
--  pricing. `profiles.tokens_used` reste l'agrégat pour les quotas ; cette
--  table est la vue analytique détaillée.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  contact_id      UUID,
  conversation_id UUID,
  feature         TEXT NOT NULL,            -- sav_reply | lifecycle | template_generate | translate | vision | transcription | agent_generate | refine_prompt | summary | extract_info | email | campaign | escalation | embedding | other
  model           TEXT NOT NULL,            -- gpt-4o-mini | gpt-4o | text-embedding-3-small | whisper-1 ...
  prompt_tokens   INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  -- Coût en USD (micro-précision : 6 décimales) calculé au moment de l'appel.
  cost_usd        NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user       ON ai_usage_log (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature    ON ai_usage_log (feature, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created    ON ai_usage_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_conv       ON ai_usage_log (conversation_id);

COMMIT;
