-- ============================================================
-- MIGRATION : email_agent_id + signature sur email_sessions
-- À exécuter dans : https://supabase.com/dashboard/project/jdeslkxwbtqkeifrlmnf/sql
-- ============================================================

ALTER TABLE public.email_sessions
  ADD COLUMN IF NOT EXISTS email_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

ALTER TABLE public.email_sessions
  ADD COLUMN IF NOT EXISTS signature text;
