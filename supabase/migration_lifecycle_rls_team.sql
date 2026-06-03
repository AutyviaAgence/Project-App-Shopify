-- ════════════════════════════════════════════════════════════════════════════
-- Élargir les policies RLS de conversation_lifecycle_stages à l'accès ÉQUIPE
--
-- Problème : les policies initiales n'autorisaient l'écriture qu'au propriétaire
-- direct de la session (s.user_id = auth.uid()). Or une conversation peut
-- appartenir à une session d'ÉQUIPE (whatsapp_sessions.team_id), et un membre
-- de l'équipe doit pouvoir poser/retirer des étiquettes (comme pour les tags et
-- comme le fait canAccessSession() côté applicatif).
--
-- Sans ça, l'INSERT/DELETE renvoie une violation RLS → 500 sur
-- PUT /api/conversations/[id]/tags pour les comptes membres d'équipe.
--
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper : la conversation est-elle accessible (propriétaire OU membre d'équipe) ?
-- On inline la condition dans chaque policy (pas de fonction pour rester simple).

-- ── SELECT ──
DROP POLICY IF EXISTS "Users can view lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can view lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = s.team_id
            AND tm.user_id = auth.uid()
            AND tm.status = 'accepted'
          )
        )
      )
    )
  );

-- ── INSERT ──
DROP POLICY IF EXISTS "Users can create lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can create lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = s.team_id
            AND tm.user_id = auth.uid()
            AND tm.status = 'accepted'
          )
        )
      )
    )
    AND
    -- L'étiquette doit appartenir au propriétaire de la session (référentiel
    -- d'étiquettes du compte), pas forcément au membre qui l'applique.
    EXISTS (
      SELECT 1 FROM lifecycle_stages st
      JOIN conversations c ON c.id = conversation_lifecycle_stages.conversation_id
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE st.id = conversation_lifecycle_stages.stage_id
      AND st.user_id = s.user_id
    )
  );

-- ── DELETE ──
DROP POLICY IF EXISTS "Users can delete lifecycle assignments for their conversations" ON public.conversation_lifecycle_stages;
CREATE POLICY "Users can delete lifecycle assignments for their conversations"
  ON public.conversation_lifecycle_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN whatsapp_sessions s ON c.session_id = s.id
      WHERE c.id = conversation_lifecycle_stages.conversation_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = s.team_id
            AND tm.user_id = auth.uid()
            AND tm.status = 'accepted'
          )
        )
      )
    )
  );
