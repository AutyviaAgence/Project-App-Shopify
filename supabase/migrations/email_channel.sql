-- ============================================================
-- MIGRATION: Canal Email (email_sessions, canned_responses)
-- À exécuter dans l'éditeur SQL de Supabase Dashboard
-- ============================================================

-- 1. Table email_sessions
CREATE TABLE IF NOT EXISTS public.email_sessions (
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

-- 2. Table de liaison email_sessions ↔ teams
CREATE TABLE IF NOT EXISTS public.email_session_teams (
  email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (email_session_id, team_id)
);

-- 3. Table réponses prédéfinies
CREATE TABLE IF NOT EXISTS public.canned_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  channels text[] DEFAULT '{whatsapp,email}',
  created_at timestamptz DEFAULT now()
);

-- 4. Colonne channel sur conversations (backfill whatsapp)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp';
UPDATE public.conversations SET channel = 'whatsapp' WHERE channel IS NULL;

-- 5. Colonne email_session_id sur conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS email_session_id uuid REFERENCES public.email_sessions(id) ON DELETE SET NULL;

-- 6. Colonne channel_message_id sur messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_message_id text;

-- 7. RLS
ALTER TABLE public.email_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_sessions' AND policyname = 'Users can manage their email sessions') THEN
    CREATE POLICY "Users can manage their email sessions"
      ON public.email_sessions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'canned_responses' AND policyname = 'Users can manage their canned responses') THEN
    CREATE POLICY "Users can manage their canned responses"
      ON public.canned_responses FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- 8. Grants service_role (nécessaire pour les routes API server-side)
GRANT ALL ON public.email_sessions TO service_role;
GRANT ALL ON public.email_session_teams TO service_role;
GRANT ALL ON public.canned_responses TO service_role;
