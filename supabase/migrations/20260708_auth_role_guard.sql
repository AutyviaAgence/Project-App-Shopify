-- =====================================================================
--  MIGRATION — Garde contre les comptes auth créés avec role vide
--  Date : 2026-07-08 (déjà appliquée en prod le 2026-07-07)
--
--  CONTEXTE : la config GoTrue du stack self-hosted a GOTRUE_JWT_DEFAULT_GROUP_NAME
--  vide → les nouveaux comptes naissent avec auth.users.role = '' → le JWT porte
--  role:"" → CHAQUE requête PostgREST du compte échoue (22023: role "" does not
--  exist), silencieusement là où le code est fail-open.
--
--  Ce trigger force role='authenticated' à l'insertion. Il ne touche PAS `aud` :
--  GoTrue recherche les comptes par SON aud configurée (vide ici) — modifier aud
--  rend le compte invisible pour lui (login refusé). Vrai fix : définir
--  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated dans l'env du conteneur auth.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_auth_role_defaults() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role IS NULL OR NEW.role = '' THEN NEW.role := 'authenticated'; END IF;
  RETURN NEW;
END; $$;

-- INSERT **ET UPDATE** : GoTrue réécrit role='' à CHAQUE login (pas seulement
-- à la création) — constaté en prod le 2026-07-07 (le rôle réparé était
-- redevenu vide après une reconnexion Google).
DROP TRIGGER IF EXISTS ensure_auth_role_defaults ON auth.users;
CREATE TRIGGER ensure_auth_role_defaults
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_auth_role_defaults();

-- Répare les comptes existants nés avec un role vide.
UPDATE auth.users SET role = 'authenticated' WHERE role IS NULL OR role = '';

COMMIT;
