-- ════════════════════════════════════════════════════════════════════════════
-- Migration : FUSION Tags → Lifecycle en étiquettes MULTIPLES
-- À exécuter dans le SQL Editor de Supabase.
--
-- Objectif :
--   - Une conversation peut avoir PLUSIEURS étiquettes lifecycle (avant : 1 seule
--     via conversations.lifecycle_stage_id).
--   - Les anciens "tags" (conversation_tags) deviennent des lifecycle_stages.
--   - Les anciennes assignations (conversation_tag_assignments) + le lien unique
--     (conversations.lifecycle_stage_id) sont copiés dans la nouvelle table de liaison.
--
-- IMPORTANT :
--   - Idempotent (réexécutable sans casser). Utilise IF NOT EXISTS / ON CONFLICT.
--   - On NE SUPPRIME RIEN pour l'instant (conversation_tags,
--     conversation_tag_assignments, conversations.lifecycle_stage_id sont conservés).
--     Le code applicatif lit désormais depuis conversation_lifecycle_stages.
--   - Le bloc de suppression (DROP) est tout en bas, COMMENTÉ : à décommenter
--     seulement quand tu auras validé que tout fonctionne.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Nouvelle table de liaison (calquée sur conversation_tag_assignments) ──
CREATE TABLE IF NOT EXISTS public.conversation_lifecycle_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.lifecycle_stages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_lifecycle_conversation
  ON public.conversation_lifecycle_stages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_lifecycle_stage
  ON public.conversation_lifecycle_stages(stage_id);

-- ── 2. GRANTs (privilèges de table pour les rôles Supabase) ──
-- INDISPENSABLE : sans ces GRANTs, toute requête (même service_role/RLS) renvoie
-- "permission denied for table conversation_lifecycle_stages". Les tables créées
-- à la main dans le SQL Editor n'héritent PAS automatiquement des privilèges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_lifecycle_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_lifecycle_stages TO service_role;
GRANT SELECT ON public.conversation_lifecycle_stages TO anon;

-- ── 2b. RLS + policies (calquées sur conversation_tag_assignments) ──
ALTER TABLE public.conversation_lifecycle_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can view lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can create lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND s.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM lifecycle_stages st
      WHERE st.id = conversation_lifecycle_stages.stage_id
      AND st.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can delete lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND s.user_id = auth.uid()
    )
  );

-- ── 3. Migration des données ──

-- 3a. Les anciens tags deviennent des lifecycle_stages (s'ils n'existent pas déjà
--     par nom+user). position = à la suite des stages existants de l'utilisateur.
INSERT INTO public.lifecycle_stages (user_id, name, color, icon, position, description)
SELECT
  t.user_id,
  t.name,
  COALESCE(t.color, '#6366f1'),
  NULL,
  COALESCE((SELECT MAX(position) FROM public.lifecycle_stages ls WHERE ls.user_id = t.user_id), 0)
    + ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY t.created_at),
  NULL
FROM public.conversation_tags t
WHERE NOT EXISTS (
  SELECT 1 FROM public.lifecycle_stages ls
  WHERE ls.user_id = t.user_id AND lower(ls.name) = lower(t.name)
);

-- 3b. Copier les assignations de tags → liaison lifecycle.
--     On retrouve le stage correspondant par (user_id, name) du tag.
INSERT INTO public.conversation_lifecycle_stages (conversation_id, stage_id)
SELECT DISTINCT a.conversation_id, ls.id
FROM public.conversation_tag_assignments a
JOIN public.conversation_tags t ON t.id = a.tag_id
JOIN public.lifecycle_stages ls
  ON ls.user_id = t.user_id AND lower(ls.name) = lower(t.name)
ON CONFLICT (conversation_id, stage_id) DO NOTHING;

-- 3c. Copier le lien unique lifecycle_stage_id existant → liaison.
INSERT INTO public.conversation_lifecycle_stages (conversation_id, stage_id)
SELECT c.id, c.lifecycle_stage_id
FROM public.conversations c
WHERE c.lifecycle_stage_id IS NOT NULL
ON CONFLICT (conversation_id, stage_id) DO NOTHING;

-- ── 4. Vérifications (à lire après exécution) ──
-- SELECT 'stages' AS t, count(*) FROM public.lifecycle_stages
-- UNION ALL SELECT 'liaison', count(*) FROM public.conversation_lifecycle_stages
-- UNION ALL SELECT 'anciens_tags', count(*) FROM public.conversation_tags
-- UNION ALL SELECT 'anciennes_assign', count(*) FROM public.conversation_tag_assignments;

-- ════════════════════════════════════════════════════════════════════════════
-- ── 5. NETTOYAGE FINAL (À DÉCOMMENTER PLUS TARD, après validation complète) ──
-- ATTENTION : irréversible. Ne lancer que lorsque l'app fonctionne 100% sur la
-- nouvelle table et que les anciennes données ne sont plus nécessaires.
--
-- DROP TABLE IF EXISTS public.conversation_tag_assignments;
-- DROP TABLE IF EXISTS public.conversation_tags;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS lifecycle_stage_id;
-- ════════════════════════════════════════════════════════════════════════════
