-- ============================================================================
-- Migration: Fix agent_type CHECK constraint to support qualifier
-- Also ensures is_pinned and stop_condition columns exist
-- ============================================================================

-- 1. Add agent_type if it doesn't exist (from migration_campaigns)
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'conversation';

-- 2. Drop the old CHECK constraint that only allows conversation/relance
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_agent_type_check;

-- 3. Re-create with qualifier included
ALTER TABLE ai_agents
  ADD CONSTRAINT ai_agents_agent_type_check
  CHECK (agent_type IN ('conversation', 'relance', 'qualifier'));

-- 4. Add is_pinned if missing
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_agents_pinned
  ON ai_agents(user_id, is_pinned DESC, created_at DESC);

-- 5. Add stop_condition if missing
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS stop_condition TEXT;

-- ============================================================================
-- 6. Add qualifier_agent_id to whatsapp_sessions
-- ============================================================================
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS qualifier_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_qualifier ON whatsapp_sessions(qualifier_agent_id)
  WHERE qualifier_agent_id IS NOT NULL;

-- ============================================================================
-- 7. Table qualifier_routes (scénarios de redirection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.qualifier_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  target_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualifier_routes_agent ON qualifier_routes(agent_id);
CREATE INDEX IF NOT EXISTS idx_qualifier_routes_target ON qualifier_routes(target_agent_id);

-- RLS
ALTER TABLE public.qualifier_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage qualifier routes via agent ownership" ON public.qualifier_routes;
CREATE POLICY "Users can manage qualifier routes via agent ownership"
  ON public.qualifier_routes
  FOR ALL
  USING (agent_id IN (SELECT id FROM public.ai_agents WHERE user_id = (select auth.uid())))
  WITH CHECK (agent_id IN (SELECT id FROM public.ai_agents WHERE user_id = (select auth.uid())));

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_qualifier_routes_updated_at ON qualifier_routes;
CREATE TRIGGER update_qualifier_routes_updated_at
  BEFORE UPDATE ON qualifier_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Grants
GRANT ALL ON public.qualifier_routes TO service_role;
GRANT ALL ON public.qualifier_routes TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifier_routes TO authenticated;
