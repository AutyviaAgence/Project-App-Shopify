-- Migration: Sécuriser booking_clicks_stats (vue) et campaign_opt_out_keywords
-- Date: 2026-02-01

-- =============================================
-- 1. campaign_opt_out_keywords - Table de référence globale
-- =============================================
-- Cette table contient les mots-clés d'opt-out partagés entre tous les utilisateurs.
-- Tous peuvent lire, seuls les admins (service role) peuvent modifier.

ALTER TABLE campaign_opt_out_keywords ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies existantes si elles existent
DROP POLICY IF EXISTS "Anyone can read opt-out keywords" ON campaign_opt_out_keywords;
DROP POLICY IF EXISTS "Only service role can insert keywords" ON campaign_opt_out_keywords;
DROP POLICY IF EXISTS "Only service role can update keywords" ON campaign_opt_out_keywords;
DROP POLICY IF EXISTS "Only service role can delete keywords" ON campaign_opt_out_keywords;

-- Lecture publique (tous les utilisateurs authentifiés)
CREATE POLICY "Anyone can read opt-out keywords"
  ON campaign_opt_out_keywords
  FOR SELECT
  USING (true);

-- Insertion, modification, suppression : uniquement via service role (pas de policy = refusé)
-- Le service role bypass RLS automatiquement, donc pas besoin de policy pour INSERT/UPDATE/DELETE

-- =============================================
-- 2. booking_clicks_stats - Vue basée sur booking_link_clicks
-- =============================================
-- Les vues dans PostgreSQL/Supabase héritent des permissions de la table source.
-- Comme booking_link_clicks a RLS, la vue est déjà sécurisée.
-- Mais pour plus de clarté, on peut recréer la vue avec SECURITY INVOKER (par défaut).

-- Recréer la vue pour s'assurer qu'elle utilise SECURITY INVOKER
DROP VIEW IF EXISTS booking_clicks_stats;

CREATE VIEW booking_clicks_stats
WITH (security_invoker = true) AS
SELECT
  agent_id,
  COUNT(*) as total_clicks,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  COUNT(DISTINCT contact_id) as unique_contacts,
  DATE_TRUNC('day', clicked_at) as click_date
FROM booking_link_clicks
GROUP BY agent_id, DATE_TRUNC('day', clicked_at);

COMMENT ON VIEW booking_clicks_stats IS 'Statistiques agrégées des clics sur liens de RDV par agent (sécurisé via RLS de booking_link_clicks)';

-- =============================================
-- 3. Vérification
-- =============================================
-- Après cette migration:
-- - campaign_opt_out_keywords: RLS activé, lecture publique, écriture service role only
-- - booking_clicks_stats: Vue avec security_invoker, hérite RLS de booking_link_clicks
