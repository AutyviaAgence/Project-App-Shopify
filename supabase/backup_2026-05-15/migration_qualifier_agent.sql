-- ============================================================================
-- Migration: Agent Qualificateur (routeur intelligent)
-- Un agent qui intercepte les messages sans agent assigné et redirige
-- vers le bon agent IA selon des scénarios configurés par l'utilisateur.
-- ============================================================================

-- 1. Ajouter 'qualifier' comme type d'agent possible
-- (agent_type est un TEXT, pas un ENUM, donc pas besoin d'ALTER TYPE)
-- Valeurs possibles: 'conversation', 'relance', 'qualifier'

-- 2. Ajouter qualifier_agent_id sur whatsapp_sessions
-- Détermine quel agent qualifier est actif par défaut sur cette session
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS qualifier_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_qualifier ON whatsapp_sessions(qualifier_agent_id)
  WHERE qualifier_agent_id IS NOT NULL;

-- 3. Table des routes de qualification (scénarios de redirection)
-- Chaque route = un scénario qui redirige vers un agent cible
CREATE TABLE IF NOT EXISTS public.qualifier_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,

  -- Agent cible vers lequel rediriger
  target_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,

  -- Nom du scénario (ex: "Demande commerciale", "Support technique")
  name TEXT NOT NULL,

  -- Description du scénario pour l'IA (quand déclencher cette route)
  description TEXT NOT NULL,

  -- Ordre de priorité (plus petit = plus prioritaire)
  priority INTEGER DEFAULT 0,

  -- Actif/inactif
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualifier_routes_agent ON qualifier_routes(agent_id);
CREATE INDEX IF NOT EXISTS idx_qualifier_routes_target ON qualifier_routes(target_agent_id);

-- 4. RLS
ALTER TABLE public.qualifier_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage qualifier routes via agent ownership"
  ON public.qualifier_routes
  FOR ALL
  USING (agent_id IN (SELECT id FROM public.ai_agents WHERE user_id = (select auth.uid())))
  WITH CHECK (agent_id IN (SELECT id FROM public.ai_agents WHERE user_id = (select auth.uid())));

-- 5. Trigger updated_at
CREATE TRIGGER update_qualifier_routes_updated_at
  BEFORE UPDATE ON qualifier_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Grants pour service_role
GRANT ALL ON public.qualifier_routes TO service_role;
GRANT ALL ON public.qualifier_routes TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifier_routes TO authenticated;
