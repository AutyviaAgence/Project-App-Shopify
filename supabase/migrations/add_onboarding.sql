-- Migration : ajout du flow onboarding
-- onboarding_status dans profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'onboarding', 'active')),
  ADD COLUMN IF NOT EXISTS onboarding_plan text
    CHECK (onboarding_plan IN ('starter', 'pro', 'scale'));

-- Table des configurations onboarding (une par client)
CREATE TABLE IF NOT EXISTS public.onboarding_configs (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Choix fixes
  main_function text NOT NULL CHECK (main_function IN ('sav', 'leads', 'rdv', 'devis')),
  behavior text NOT NULL CHECK (behavior IN ('direct', 'qualify_transfer', 'qualify_silent')),
  tools text[] NOT NULL DEFAULT '{}',
  escalation text NOT NULL CHECK (escalation IN ('never', 'qualified', 'on_demand', 'off_hours')),
  languages text[] NOT NULL DEFAULT '{}',
  -- Champs libres
  agent_name text NOT NULL,
  welcome_message text NOT NULL,
  -- Statut
  submitted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
