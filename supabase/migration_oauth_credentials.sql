-- Migration: Shared OAuth Credentials
-- Allows users to create reusable OAuth credentials across multiple agent tools

-- 1. Create oauth_credentials table
CREATE TABLE IF NOT EXISTS public.oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,

  -- Display
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',

  -- OAuth client (client_secret encrypted via encryptMessage)
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,

  -- Tokens (encrypted via encryptMessage)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Scopes granted, extra metadata
  scopes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_connected BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.oauth_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own credentials"
  ON public.oauth_credentials
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_user ON public.oauth_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_provider ON public.oauth_credentials(user_id, provider);

-- 4. Add credential_id FK on agent_tools
ALTER TABLE public.agent_tools
  ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES public.oauth_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tools_credential ON public.agent_tools(credential_id);
