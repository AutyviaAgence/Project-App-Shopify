-- =====================================================================
--  SCHEMA CIBLE — App Shopify Chatbot (WhatsApp Business API)
-- =====================================================================
--  Document de RÉFÉRENCE représentant l'état CIBLE post-refonte V2.
--
--  ⚠️  CE FICHIER N'EST PAS APPLIQUÉ AUTOMATIQUEMENT À LA BASE.
--      Il décrit la structure voulue après la refonte. La base réelle
--      (VPS self-hosted) sera migrée progressivement pendant la refonte.
--
--  Périmètre CIBLE :
--    ✅ WhatsApp Business API (WABA) uniquement
--    ✅ Agents IA (simplifiés)
--    ✅ Conversations / Messages / Contacts
--    ✅ Lifecycle (intégré aux conversations)
--    ✅ Knowledge base / RAG (pgvector)
--    ✅ Tools (Shopify, etc.)
--    ✅ Campagnes WhatsApp + opt-out
--    ✅ Abonnement / Stripe / quotas tokens / affiliation
--    ✅ Multi-tenant (branding)
--
--  RETIRÉ par rapport à l'ancienne base :
--    ❌ Teams (teams, team_members, team_invitations, *_teams, colonnes team_id)
--    ❌ Email (email_sessions, email_session_teams, colonnes email_session_id)
--    ❌ Evolution API (colonnes instance_id, qr_code, pairing_code)
--    ❌ Tags legacy (conversation_tags / conversation_tag_assignments → remplacés par lifecycle)
--
--  Convention : tout est scopé par user_id (RLS user-only, plus de team).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- =====================================================================
--  1. UTILISATEURS / TENANT / FACTURATION
-- =====================================================================

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  domain        TEXT,
  app_name      TEXT,
  logo_url      TEXT,
  favicon_url   TEXT,
  primary_color TEXT,
  accent_color  TEXT,
  sidebar_color TEXT,
  bg_color      TEXT,
  text_color    TEXT,
  support_email TEXT,
  theme_config  JSONB,
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Profils utilisateurs (lié à auth.users)
CREATE TABLE profiles (
  id                           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                        TEXT,
  full_name                    TEXT,
  avatar_url                   TEXT,
  timezone                     TEXT DEFAULT 'Europe/Paris',
  data_retention_months        INTEGER,
  -- Abonnement / Stripe
  subscription_status          TEXT DEFAULT 'trial',
  trial_ends_at                TIMESTAMPTZ,
  subscription_ends_at         TIMESTAMPTZ,
  stripe_customer_id           TEXT,
  stripe_subscription_id       TEXT,
  plan                         TEXT,
  pending_plan                 TEXT,
  onboarding_plan              TEXT,
  audit_status                 TEXT,
  -- Quotas tokens IA
  tokens_used                  BIGINT DEFAULT 0,
  tokens_limit                 BIGINT,
  tokens_extra                 BIGINT DEFAULT 0,
  token_usage_period_start     TIMESTAMPTZ,
  -- Lifecycle (seuil d'auto-analyse)
  lifecycle_analysis_threshold INTEGER,
  -- Multi-tenant
  tenant_id                    UUID REFERENCES tenants(id),
  role                         TEXT DEFAULT 'user',
  -- Modération
  is_banned                    BOOLEAN DEFAULT false,
  banned_at                    TIMESTAMPTZ,
  banned_reason                TEXT,
  -- Referral
  referral_code                TEXT,
  referred_by                  UUID REFERENCES profiles(id),
  terms_accepted_at            TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ DEFAULT now(),
  updated_at                   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_history (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount                   INTEGER,
  currency                 TEXT DEFAULT 'eur',
  status                   TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id        TEXT,
  description              TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promo_codes (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                 TEXT UNIQUE NOT NULL,
  stripe_coupon_id     TEXT,
  stripe_promo_code_id TEXT,
  discount_percent     NUMERIC,
  max_redemptions      INTEGER,
  applies_to           TEXT,
  is_active            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE affiliate_codes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code               TEXT UNIQUE NOT NULL,
  label              TEXT,
  commission_percent NUMERIC,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE affiliate_conversions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_code_id        UUID REFERENCES affiliate_codes(id) ON DELETE SET NULL,
  affiliate_user_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  converted_user_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount_paid_cents        INTEGER,
  commission_cents         INTEGER,
  currency                 TEXT DEFAULT 'eur',
  status                   TEXT DEFAULT 'pending',
  payout_method            TEXT,
  paid_at                  TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE referral_rewards (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referee_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rewarded_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tokens_credited  INTEGER,
  trigger_event    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE system_config (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_alerts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT,
  title      TEXT,
  message    TEXT,
  metadata   JSONB,
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  2. AGENTS IA (version simplifiée)
-- =====================================================================

CREATE TABLE ai_agents (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  description                   TEXT,
  system_prompt                 TEXT,
  objective                     TEXT,
  -- Modèle IA
  model                         TEXT DEFAULT 'gpt-4o-mini',
  temperature                   DOUBLE PRECISION DEFAULT 0.7,
  agent_type                    TEXT DEFAULT 'conversation',  -- 'conversation' | 'qualifier' | 'relance'
  -- Comportement
  response_delay_min            INTEGER DEFAULT 0,
  response_delay_max            INTEGER DEFAULT 0,
  max_messages_per_conversation INTEGER,
  inactivity_timeout_minutes    INTEGER,
  auto_detect_language          BOOLEAN DEFAULT true,
  stop_condition                TEXT,
  -- Escalade
  escalation_enabled            BOOLEAN DEFAULT false,
  escalation_mode               TEXT,                          -- 'keywords' | 'ai' | 'both'
  escalation_keywords           TEXT[],
  escalation_message            TEXT,
  -- Horaires
  schedule_enabled              BOOLEAN DEFAULT false,
  schedule_timezone             TEXT,
  schedule_start_time           TIME,
  schedule_end_time             TIME,
  schedule_days                 TEXT[],
  -- Booking
  booking_url                   TEXT,
  -- UI
  is_active                     BOOLEAN DEFAULT true,
  is_pinned                     BOOLEAN DEFAULT false,
  mascot                        TEXT,
  mascot_bg                     TEXT,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE qualifier_routes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  target_agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  name            TEXT,
  description     TEXT,
  priority        INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Workflows visuels (optionnels) — conservés mais non prioritaires
CREATE TABLE agent_workflows (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id   UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  nodes      JSONB,
  edges      JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workflow_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  icon        TEXT,
  nodes       JSONB,
  edges       JSONB,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE onboarding_configs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  main_function        TEXT,
  behavior             TEXT,
  tools                TEXT[],
  escalation           TEXT,
  languages            TEXT[],
  conversation_example TEXT,
  info_to_collect      TEXT,
  cgv_accepted_at      TIMESTAMPTZ,
  admin_validated_at   TIMESTAMPTZ,
  admin_validated_by   TEXT,
  admin_notes          TEXT,
  submitted_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  3. CANAL WHATSAPP (WABA uniquement)
-- =====================================================================

CREATE TABLE whatsapp_sessions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name             TEXT,
  status                   TEXT DEFAULT 'connected',   -- 'connected' | 'disconnected' | 'error'
  phone_number             TEXT,
  -- WABA (Meta Cloud API)
  waba_phone_number_id     TEXT NOT NULL,
  waba_business_account_id TEXT,
  waba_access_token        TEXT NOT NULL,              -- chiffré
  -- Réglages IA
  daily_ai_message_limit   INTEGER,
  ai_message_delay         INTEGER,
  qualifier_agent_id       UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  welcome_sent             BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE wa_links (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id        UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  name               TEXT,
  slug               TEXT UNIQUE,
  pre_filled_message TEXT,
  tracking_source    TEXT,
  click_count        INTEGER DEFAULT 0,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE link_clicks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id      UUID REFERENCES wa_links(id) ON DELETE CASCADE,
  clicked_at   TIMESTAMPTZ DEFAULT now(),
  user_agent   TEXT,
  ip_hash      TEXT,
  referer      TEXT,
  country      TEXT,
  city         TEXT,
  device_type  TEXT,
  os           TEXT,
  browser      TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  is_unique    BOOLEAN DEFAULT true
);

CREATE TABLE webhook_logs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id         UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  event_type         TEXT,
  payload            JSONB,
  status             TEXT,
  error_message      TEXT,
  processing_time_ms INTEGER,
  created_at         TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  4. CONTACTS / CONVERSATIONS / MESSAGES
-- =====================================================================

CREATE TABLE contacts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id            UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  phone_number          TEXT NOT NULL,
  name                  TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  notes                 TEXT,
  ai_summary            TEXT,
  ai_summary_updated_at TIMESTAMPTZ,
  profile_picture       TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
  id                                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id                        UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  contact_id                        UUID REFERENCES contacts(id) ON DELETE CASCADE,
  ai_agent_id                       UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  wa_link_id                        UUID REFERENCES wa_links(id) ON DELETE SET NULL,
  last_message_at                   TIMESTAMPTZ,
  last_message_preview              TEXT,
  unread_count                      INTEGER DEFAULT 0,
  is_ai_active                      BOOLEAN DEFAULT true,
  is_pinned                         BOOLEAN DEFAULT false,
  -- Escalade humaine
  escalation_reason                 TEXT,
  escalated_at                      TIMESTAMPTZ,
  -- Lifecycle (intégré aux conversations)
  lifecycle_stage_id                UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  lifecycle_last_analyzed_at        TIMESTAMPTZ,
  lifecycle_messages_since_analysis INTEGER DEFAULT 0,
  created_at                        TIMESTAMPTZ DEFAULT now(),
  updated_at                        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id    UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id        UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  direction          TEXT NOT NULL,             -- 'inbound' | 'outbound'
  content            TEXT,                       -- chiffré
  message_type       TEXT DEFAULT 'text',        -- 'text'|'image'|'audio'|'video'|'document'|...
  media_url          TEXT,
  media_mime_type    TEXT,
  transcription      TEXT,
  reaction_emoji     TEXT,
  wa_message_id      TEXT,                       -- id Meta (déduplication)
  channel_message_id TEXT,
  sent_by            TEXT,                       -- nom contact ou agent
  status             TEXT DEFAULT 'sent',        -- 'sent'|'delivered'|'read'|'failed'
  ai_processed       BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  5. LIFECYCLE (catégorisation des conversations)
-- =====================================================================

CREATE TABLE lifecycle_stages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversation_lifecycle_stages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  stage_id        UUID NOT NULL REFERENCES lifecycle_stages(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lifecycle_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_stage_id   UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  to_stage_id     UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  reason          TEXT,
  changed_by      TEXT,         -- 'ai' | 'user'
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  6. OUTILS (Shopify, etc.) + credentials OAuth
-- =====================================================================

CREATE TABLE oauth_credentials (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             TEXT,
  provider         TEXT,                      -- 'shopify'|'stripe'|'google'|...
  credential_type  TEXT,                      -- 'oauth2'|'api_key'|'bearer'|'consumer_keys'
  client_id        TEXT,
  client_secret    TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes           TEXT,
  metadata         JSONB,                     -- secrets chiffrés
  is_connected     BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_tools (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credential_id UUID REFERENCES oauth_credentials(id) ON DELETE SET NULL,
  tool_type     TEXT,                          -- 'shopify'|'woocommerce'|'stripe'|...
  name          TEXT,
  description   TEXT,
  config        JSONB,                         -- chiffré
  permissions   TEXT DEFAULT 'read',           -- 'read'|'write'|'read_write'
  rate_limit    INTEGER,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tool_execution_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  tool_id         UUID REFERENCES agent_tools(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  function_name   TEXT,
  parameters      JSONB,
  result          JSONB,
  status          TEXT,
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  7. KNOWLEDGE BASE / RAG (pgvector)
-- =====================================================================

CREATE TABLE knowledge_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT,
  description   TEXT,
  doc_type      TEXT,
  text_content  TEXT,
  storage_path  TEXT,
  status        TEXT DEFAULT 'pending',
  error_message TEXT,
  chunk_count   INTEGER DEFAULT 0,
  char_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  content     TEXT,
  token_count INTEGER,
  embedding   extensions.vector(1536),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge_images (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id     UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  ref          TEXT,
  storage_path TEXT,
  filename     TEXT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_knowledge_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  8. CAMPAGNES WHATSAPP + OPT-OUT
-- =====================================================================

CREATE TABLE campaigns (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                         TEXT NOT NULL,
  status                       TEXT DEFAULT 'draft',
  message_template             TEXT,
  relance_agent_id             UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  conversation_agent_id        UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  -- Filtres de ciblage
  filter_session_ids           UUID[],
  filter_tracking_sources      TEXT[],
  filter_tag_ids               UUID[],
  filter_link_ids              UUID[],
  filter_lifecycle_stage_ids   UUID[],
  filter_inactivity_days       INTEGER,
  filter_exclude_replied       BOOLEAN DEFAULT true,
  -- Limites d'envoi (anti-spam / opt-in)
  max_recipients               INTEGER,
  delay_between_min            INTEGER,
  delay_between_max            INTEGER,
  messages_per_hour            INTEGER,
  send_hour_start              INTEGER,
  send_hour_end                INTEGER,
  min_response_rate            DOUBLE PRECISION,
  min_days_since_last_campaign INTEGER,
  -- Planning
  scheduled_at                 TIMESTAMPTZ,
  started_at                   TIMESTAMPTZ,
  completed_at                 TIMESTAMPTZ,
  paused_at                    TIMESTAMPTZ,
  pause_reason                 TEXT,
  -- Compteurs
  total_recipients             INTEGER DEFAULT 0,
  sent_count                   INTEGER DEFAULT 0,
  delivered_count              INTEGER DEFAULT 0,
  replied_count                INTEGER DEFAULT 0,
  failed_count                 INTEGER DEFAULT 0,
  created_at                   TIMESTAMPTZ DEFAULT now(),
  updated_at                   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  status          TEXT DEFAULT 'queued',
  message_sent    TEXT,
  queued_at       TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Opt-out : blacklist + mots-clés de désinscription
CREATE TABLE campaign_blacklist (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  reason          TEXT,
  keyword_matched TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE campaign_opt_out_keywords (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  9. BOOKING (prise de rendez-vous via lien)
-- =====================================================================

CREATE TABLE booking_proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  proposed_at     TIMESTAMPTZ DEFAULT now(),
  clicked         BOOLEAN DEFAULT false,
  clicked_at      TIMESTAMPTZ
);

CREATE TABLE booking_link_clicks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  proposal_id     UUID REFERENCES booking_proposals(id) ON DELETE SET NULL,
  user_agent      TEXT,
  ip_hash         TEXT,
  referer         TEXT,
  clicked_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
--  10. RÉPONSES PRÉ-ENREGISTRÉES / STATS
-- =====================================================================

CREATE TABLE canned_responses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT,
  channels   TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stats_daily (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id                UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id               UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  wa_link_id                UUID REFERENCES wa_links(id) ON DELETE SET NULL,
  date                      DATE,
  messages_sent             INTEGER DEFAULT 0,
  messages_received         INTEGER DEFAULT 0,
  conversations_started     INTEGER DEFAULT 0,
  response_rate             DOUBLE PRECISION,
  avg_response_time_seconds INTEGER
);


-- =====================================================================
--  NOTES RLS
-- =====================================================================
--  Toutes les tables scopées utilisateur activent la RLS avec une policy
--  basée sur user_id = auth.uid() (directement ou via la table parente).
--  Tables globales (workflow_templates, campaign_opt_out_keywords,
--  system_config, promo_codes, tenants) : lecture publique / admin-only.
--
--  ⚠️  Les policies détaillées seront (re)définies pendant la refonte
--      (simplification : suppression de toute la logique team, user-only).
-- =====================================================================
