-- ============================================================
-- AUTYVIA — SCHEMA PUBLIC COMPLET
-- Généré depuis la vraie structure DB (avril 2026)
-- IMPORTANT : Mettre à jour ce fichier à chaque modification de la structure DB
-- ============================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  timezone text,
  data_retention_months integer,
  subscription_status text DEFAULT 'none' CHECK (subscription_status IS NULL OR subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'none')),
  trial_ends_at timestamp with time zone,
  subscription_ends_at timestamp with time zone,
  stripe_customer_id text,
  stripe_subscription_id text,
  tokens_used bigint NOT NULL DEFAULT 0,
  tokens_limit bigint NOT NULL DEFAULT 100000,
  tokens_extra bigint NOT NULL DEFAULT 0,
  token_usage_period_start timestamp with time zone,
  lifecycle_analysis_threshold integer,
  tenant_id uuid,
  plan text DEFAULT NULL CHECK (plan IS NULL OR plan IN ('starter', 'pro', 'scale')),
  pending_plan text CHECK (pending_plan IS NULL OR pending_plan IN ('starter', 'pro', 'scale')),
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  audit_status text NOT NULL DEFAULT 'none' CHECK (audit_status IN ('none', 'acompte_paid', 'solde_paid', 'refunded')),
  onboarding_plan text CHECK (onboarding_plan IN ('starter', 'pro', 'scale')),
  is_banned boolean DEFAULT false,
  banned_at timestamp with time zone,
  banned_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_configs (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  main_function text NOT NULL CHECK (main_function IN ('sav', 'leads', 'rdv', 'devis')),
  behavior text NOT NULL CHECK (behavior IN ('direct', 'qualify_transfer', 'qualify_silent')),
  tools text[] NOT NULL DEFAULT '{}',
  escalation text NOT NULL CHECK (escalation IN ('never', 'qualified', 'on_demand', 'off_hours')),
  languages text[] NOT NULL DEFAULT '{}',
  agent_name text NOT NULL,
  welcome_message text NOT NULL,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenants (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  domain text,
  app_name text NOT NULL,
  logo_url text,
  favicon_url text,
  primary_color text,
  accent_color text,
  sidebar_color text,
  bg_color text,
  text_color text,
  support_email text,
  theme_config jsonb,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  join_code text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.team_members (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  invitation_token text,
  invited_email text,
  status text,
  allowed_session_ids uuid[],
  allowed_agent_ids uuid[],
  allowed_link_ids uuid[],
  allowed_campaign_ids uuid[],
  can_view_stats boolean DEFAULT false,
  can_view_knowledge boolean DEFAULT false,
  can_view_messages boolean DEFAULT false,
  can_manage_sessions boolean DEFAULT false,
  can_manage_agents boolean DEFAULT false,
  can_manage_knowledge boolean DEFAULT false,
  can_manage_links boolean DEFAULT false,
  can_send_messages boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.team_invitations (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  role text NOT NULL,
  allowed_session_ids uuid[],
  allowed_agent_ids uuid[],
  allowed_link_ids uuid[],
  allowed_campaign_ids uuid[],
  can_view_stats boolean DEFAULT false,
  can_view_knowledge boolean DEFAULT false,
  can_view_messages boolean DEFAULT false,
  can_manage_sessions boolean DEFAULT false,
  can_manage_agents boolean DEFAULT false,
  can_manage_knowledge boolean DEFAULT false,
  can_manage_links boolean DEFAULT false,
  can_send_messages boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.whatsapp_sessions (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  instance_name text NOT NULL,
  instance_id text,
  display_name text,
  status text,
  qr_code text,
  pairing_code text,
  phone_number text,
  integration_type text DEFAULT 'evolution',
  waba_phone_number_id text,
  waba_business_account_id text,
  waba_access_token text,
  daily_ai_message_limit integer,
  ai_message_delay integer DEFAULT 0,
  qualifier_agent_id uuid,
  welcome_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ai_agents (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  objective text,
  model text DEFAULT 'gpt-4o',
  temperature double precision DEFAULT 0.7,
  agent_type text DEFAULT 'standard',
  is_active boolean DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  response_delay_min integer DEFAULT 0,
  response_delay_max integer DEFAULT 0,
  max_messages_per_conversation integer,
  inactivity_timeout_minutes integer,
  escalation_enabled boolean DEFAULT false,
  escalation_mode text DEFAULT 'keywords',
  escalation_keywords text[],
  escalation_message text,
  auto_detect_language boolean DEFAULT false,
  schedule_enabled boolean DEFAULT false,
  schedule_timezone text,
  schedule_start_time time without time zone,
  schedule_end_time time without time zone,
  schedule_days text[],
  booking_url text,
  stop_condition text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.qualifier_routes (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.oauth_credentials (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  provider text NOT NULL,
  credential_type text NOT NULL DEFAULT 'oauth2',
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  scopes text,
  metadata jsonb,
  is_connected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_tools (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credential_id uuid REFERENCES public.oauth_credentials(id) ON DELETE SET NULL,
  tool_type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  permissions text NOT NULL DEFAULT 'read',
  rate_limit integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.tool_execution_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES public.agent_tools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid,
  function_name text NOT NULL,
  parameters jsonb,
  result jsonb,
  status text NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  name text,
  first_name text,
  last_name text,
  email text,
  notes text,
  ai_summary text,
  ai_summary_updated_at timestamp with time zone,
  profile_picture text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.conversation_tags (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lifecycle_stages (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  icon text,
  position integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Email sessions (channel Email — parallèle à whatsapp_sessions)
CREATE TABLE public.email_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  email_address text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gmail', 'outlook', 'smtp')),
  status text DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_password_encrypted text,
  imap_host text,
  imap_port integer,
  imap_password_encrypted text,
  oauth_access_token_encrypted text,
  oauth_refresh_token_encrypted text,
  oauth_expires_at timestamptz,
  daily_ai_message_limit integer DEFAULT 1000,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Liaison email_sessions ↔ teams (multi-équipes)
CREATE TABLE public.email_session_teams (
  email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (email_session_id, team_id)
);

-- Réponses prédéfinies (whatsapp + email)
CREATE TABLE public.canned_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  channels text[] DEFAULT '{whatsapp,email}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.conversations (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  wa_link_id uuid,
  channel text DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email')),
  email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE SET NULL,
  lifecycle_stage_id uuid REFERENCES public.lifecycle_stages(id) ON DELETE SET NULL,
  lifecycle_last_analyzed_at timestamp with time zone,
  lifecycle_messages_since_analysis integer DEFAULT 0,
  last_message_at timestamp with time zone,
  last_message_preview text,
  unread_count integer DEFAULT 0,
  is_ai_active boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  escalation_reason text,
  escalated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.conversation_tag_assignments (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.conversation_tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lifecycle_history (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.lifecycle_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.lifecycle_stages(id) ON DELETE SET NULL,
  reason text,
  changed_by text NOT NULL,
  tokens_used integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  direction text NOT NULL,
  content text,
  message_type text DEFAULT 'text',
  media_url text,
  media_mime_type text,
  transcription text,
  wa_message_id text,
  channel_message_id text,
  reaction_emoji text,
  sent_by text NOT NULL,
  status text DEFAULT 'sent',
  ai_processed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.knowledge_documents (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  doc_type text NOT NULL,
  text_content text,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  chunk_count integer DEFAULT 0,
  char_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.knowledge_chunks (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_knowledge_documents (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agent_teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.document_teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.session_teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.wa_links (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE,
  pre_filled_message text,
  tracking_source text,
  click_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.link_teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id uuid NOT NULL REFERENCES public.wa_links(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.link_clicks (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id uuid NOT NULL REFERENCES public.wa_links(id) ON DELETE CASCADE,
  proposal_id uuid,
  is_unique boolean DEFAULT false,
  user_agent text,
  ip_hash text,
  referer text,
  country text,
  city text,
  device_type text,
  os text,
  browser text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  clicked_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.booking_proposals (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  clicked boolean DEFAULT false,
  clicked_at timestamp with time zone,
  proposed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.booking_link_clicks (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.booking_proposals(id) ON DELETE SET NULL,
  user_agent text,
  ip_hash text,
  referer text,
  clicked_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.booking_clicks_stats (
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  total_clicks bigint,
  unique_conversations bigint,
  unique_contacts bigint,
  click_date timestamp with time zone
);

CREATE TABLE public.campaigns (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text DEFAULT 'draft',
  message_template text,
  relance_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  filter_session_ids uuid[],
  filter_tracking_sources text[],
  filter_tag_ids uuid[],
  filter_link_ids uuid[],
  filter_lifecycle_stage_ids uuid[],
  filter_inactivity_days integer,
  filter_exclude_replied boolean DEFAULT false,
  max_recipients integer,
  delay_between_min integer DEFAULT 5,
  delay_between_max integer DEFAULT 15,
  messages_per_hour integer,
  send_hour_start integer DEFAULT 8,
  send_hour_end integer DEFAULT 20,
  min_response_rate double precision,
  min_days_since_last_campaign integer,
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  replied_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  paused_at timestamp with time zone,
  pause_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  status text DEFAULT 'queued',
  message_sent text,
  queued_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  replied_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.campaign_teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.campaign_blacklist (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  reason text,
  keyword_matched text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.campaign_opt_out_keywords (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.stats_daily (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  wa_link_id uuid REFERENCES public.wa_links(id) ON DELETE SET NULL,
  date date NOT NULL,
  messages_sent integer DEFAULT 0,
  messages_received integer DEFAULT 0,
  conversations_started integer DEFAULT 0,
  response_rate double precision,
  avg_response_time_seconds integer
);

CREATE TABLE public.user_alerts (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_history (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  currency text DEFAULT 'eur',
  status text NOT NULL,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  description text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.webhook_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  instance_name text NOT NULL,
  payload jsonb,
  status text,
  error_message text,
  processing_time_ms integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.system_config (
  key text NOT NULL PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- TRIGGER : création automatique du profil à l'inscription
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referred_by_uuid UUID;
  ref_code TEXT;
  resolved_tenant_id UUID;
  signup_host TEXT;
BEGIN
  -- Résoudre le parrain
  ref_code := NEW.raw_user_meta_data->>'referred_by_code';
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO referred_by_uuid FROM profiles
    WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  -- Résoudre le tenant via signup_domain (passé par le frontend)
  signup_host := NEW.raw_user_meta_data->>'signup_domain';
  IF signup_host IS NOT NULL AND signup_host != '' THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE domain = signup_host LIMIT 1;
  END IF;
  IF resolved_tenant_id IS NULL THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE is_default = true LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, referred_by, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    referred_by_uuid,
    resolved_tenant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualifier_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_configs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — Email Sessions, Canned Responses
-- ============================================================

-- email_sessions : accès uniquement par le propriétaire
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_sessions' AND policyname = 'Users can manage their email sessions') THEN
    CREATE POLICY "Users can manage their email sessions"
      ON public.email_sessions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- canned_responses : accès uniquement par le propriétaire
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canned_responses' AND policyname = 'Users can manage their canned responses') THEN
    CREATE POLICY "Users can manage their canned responses"
      ON public.canned_responses FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- MIGRATION — Ajouter colonnes channel + email_session_id sur conversations
-- et channel_message_id sur messages (idempotent)
-- ============================================================

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email'));
UPDATE public.conversations SET channel = 'whatsapp' WHERE channel IS NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_message_id text;

-- MIGRATION — Contacts email : session_id nullable + email_session_id
ALTER TABLE public.contacts ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE CASCADE;

-- ============================================================
-- MIGRATION SÉCURITÉ — Déduplication emails + nettoyage sessions pending
-- ============================================================

-- Contrainte UNIQUE sur channel_message_id par conversation pour éviter doublons
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_channel_message_id_conversation_unique'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_channel_message_id_conversation_unique
      UNIQUE (channel_message_id, conversation_id);
  END IF;
END $$;

-- Nettoyage automatique des sessions Gmail en état disconnected créées depuis plus de 30 min
-- (sessions orphelines laissées si l'utilisateur a fermé le navigateur pendant OAuth)
CREATE OR REPLACE FUNCTION public.cleanup_pending_email_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.email_sessions
  WHERE provider = 'gmail'
    AND status = 'disconnected'
    AND email_address = 'pending@gmail.com'
    AND created_at < now() - interval '30 minutes';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_pending_email_sessions() FROM anon, public;

-- =============================================================
-- Système de parrainage, affiliation et codes promo
-- =============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id),
  referee_id  UUID NOT NULL REFERENCES profiles(id),
  rewarded_user_id UUID NOT NULL REFERENCES profiles(id),
  tokens_credited INTEGER NOT NULL DEFAULT 500000,
  trigger_event TEXT NOT NULL, -- 'subscription' | 'audit'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, referee_id, trigger_event)
);

CREATE TABLE IF NOT EXISTS affiliate_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  code TEXT NOT NULL UNIQUE,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code_id UUID NOT NULL REFERENCES affiliate_codes(id),
  affiliate_user_id UUID NOT NULL REFERENCES profiles(id),
  converted_user_id UUID NOT NULL REFERENCES profiles(id),
  amount_paid_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid
  payout_method TEXT, -- 'transfer' | 'credit'
  paid_at TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  stripe_coupon_id TEXT,
  stripe_promo_code_id TEXT,
  discount_percent NUMERIC(5,2) NOT NULL,
  max_redemptions INTEGER,
  applies_to TEXT NOT NULL DEFAULT 'both', -- 'subscription' | 'audit' | 'both'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    new_code := upper(substring(md5(random()::text || NEW.id::text) from 1 for 8));
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = new_code) THEN
      NEW.referral_code := new_code;
      EXIT;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      NEW.referral_code := upper(substring(md5(NEW.id::text) from 1 for 12));
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION generate_referral_code();

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users see own referral rewards" ON referral_rewards
  FOR SELECT USING (rewarded_user_id = auth.uid() OR referrer_id = auth.uid() OR referee_id = auth.uid());

ALTER TABLE affiliate_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users see own affiliate codes" ON affiliate_codes
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users see own conversions" ON affiliate_conversions
  FOR SELECT USING (affiliate_user_id = auth.uid());

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
