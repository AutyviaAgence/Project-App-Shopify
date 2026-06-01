-- Migration: Add is_pinned column to ai_agents
-- Allows users to pin agents to the top of the list

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_agents_pinned
  ON public.ai_agents(user_id, is_pinned DESC, created_at DESC);
