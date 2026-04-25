-- Changer le DEFAULT de plan à NULL (aucun plan à l'inscription)
ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT NULL,
  DROP CONSTRAINT IF EXISTS profiles_plan_check,
  ADD CONSTRAINT profiles_plan_check CHECK (plan IS NULL OR plan IN ('starter', 'pro', 'scale'));
