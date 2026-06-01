-- Migration: workflow canvas pour les agents IA (refonte v2)
-- Branche dev uniquement

-- Table des workflows visuels (nodes + edges React Flow)
CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_workflows_owner" ON public.agent_workflows
  FOR ALL TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM public.ai_agents WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM public.ai_agents WHERE user_id = auth.uid()
    )
  );

GRANT ALL ON public.agent_workflows TO authenticated;
GRANT ALL ON public.agent_workflows TO service_role;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_agent_workflow_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_workflows_updated_at
  BEFORE UPDATE ON public.agent_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_workflow_updated_at();

-- Table des templates de workflow prédéfinis
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general', -- 'support', 'booking', 'leads', 'sales'
  icon text DEFAULT '🤖',
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- Templates lisibles par tous les utilisateurs authentifiés
CREATE POLICY "workflow_templates_read" ON public.workflow_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

GRANT SELECT ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
