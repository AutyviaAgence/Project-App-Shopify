-- Migration : ajouter les colonnes plan et role dans profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'scale' CHECK (plan IN ('starter', 'pro', 'scale')),
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user' CHECK (role IN ('user', 'admin'));
