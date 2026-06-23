-- =====================================================================
--  MIGRATION — Activer Realtime sur messages & conversations
--  Date : 2026-06-16
--
--  Bug : l'inbox ne se met pas à jour en temps réel. Le client s'abonne bien
--  aux postgres_changes (messages INSERT, conversations UPDATE) mais la
--  publication `supabase_realtime` était VIDE → le serveur Realtime ne
--  diffusait aucun événement.
--
--  Fix : ajouter les 2 tables à la publication. REPLICA IDENTITY FULL sur
--  conversations pour que les payloads UPDATE arrivent complets (sinon seuls
--  les champs de la PK sont diffusés). messages n'a besoin que d'INSERT → la
--  PK suffit, mais on met FULL aussi par cohérence/robustesse.
-- =====================================================================

BEGIN;

-- Idempotent : ne rajoute la table que si elle n'est pas déjà publiée.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END$$;

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

COMMIT;
