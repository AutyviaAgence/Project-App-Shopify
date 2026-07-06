-- =====================================================================
--  MIGRATION SÉCURITÉ — Active RLS sur les tables qui l'avaient perdu
--  Date : 2026-07-06
--
--  AUDIT : 6 tables du schéma public n'avaient PAS de RLS alors que le rôle
--  `anon` (clé publique exposée au navigateur) dispose de tous les privilèges.
--  Sans RLS, n'importe qui avec la clé anon pouvait lire/écrire/supprimer ces
--  tables pour TOUS les marchands (fuite : shopify_orders = commandes clients).
--
--  Correctif : activer RLS + policy « propriétaire uniquement » (user_id =
--  auth.uid()). Le service_role (côté serveur, bypassrls) n'est pas affecté.
-- =====================================================================

BEGIN;

-- ── Tables scoping par user_id : accès réservé au propriétaire ────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shopify_orders','shopify_products','shopify_collections','ai_usage_log','ab_test_assignments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t || '_owner', t
    );
  END LOOP;
END $$;

-- ── system_config : config globale admin → AUCUN accès anon/authenticated.
-- RLS activé sans policy permissive = deny-all (seul service_role y accède).
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_config_no_client ON system_config;
-- (pas de CREATE POLICY : RLS actif sans policy = tout refusé pour anon/authenticated)

COMMIT;
