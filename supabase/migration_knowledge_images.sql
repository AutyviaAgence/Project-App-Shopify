-- Migration: table knowledge_images pour les images référençables par le LLM
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.knowledge_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  ref text NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);

ALTER TABLE public.knowledge_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_images_owner" ON public.knowledge_images
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
