-- =====================================================================
--  TRIGGERS DU MOTEUR DE CROISSANCE
--  2026-07-15
--
--  ⚠️ LA MIGRATION LA PLUS RISQUÉE DE LA REFONTE.
--
--  Elle remplace `handle_new_user`, qui s'exécute à CHAQUE inscription. Une
--  erreur ici et plus personne ne peut créer de compte.
--
--  La version ci-dessous conserve donc À L'IDENTIQUE tout ce que faisait
--  l'ancienne (création du profil, résolution du tenant par le domaine
--  d'inscription, résolution de `referred_by`) et se contente d'AJOUTER
--  l'attribution dans le nouveau moteur.
--
--  Rien n'est retiré. `profiles.referred_by` continue d'être renseigné : les
--  anciennes colonnes ne seront supprimées qu'une fois la bascule vérifiée.
--
--  ── CE QUE ÇA RÉPARE ────────────────────────────────────────────────
--
--  · Le code de parrainage n'était généré NULLE PART dans le code versionné :
--    son trigger n'existait que dans un vieux dump de sauvegarde. Sur une base
--    reconstruite, `referral_code` restait NULL et le lien devenait `/r/null`.
--
--  · L'attribution ne reconnaissait que les codes de PARRAINAGE
--    (`profiles.referral_code`). Un code d'AFFILIÉ n'était jamais trouvé — le
--    partenaire ne touchait donc jamais sa commission.
-- =====================================================================

BEGIN;

-- ── 1. Chaque marchand reçoit son code de parrainage ─────────────────
CREATE OR REPLACE FUNCTION create_referral_growth_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  -- Déjà un code ? (réexécution, backfill) → ne rien faire.
  IF EXISTS (SELECT 1 FROM growth_codes WHERE kind = 'referral' AND owner_user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  LOOP
    new_code := upper(substring(md5(random()::text || NEW.id::text) from 1 for 8));
    BEGIN
      INSERT INTO growth_codes (kind, owner_user_id, code, reward_months)
      VALUES ('referral', NEW.id, new_code, 1);
      EXIT; -- posé
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      -- Course : un autre appel vient de créer le code de cet utilisateur.
      IF EXISTS (SELECT 1 FROM growth_codes WHERE kind = 'referral' AND owner_user_id = NEW.id) THEN
        EXIT;
      END IF;
      -- Sinon c'est une collision de code : on retente.
      IF attempts > 10 THEN
        EXIT; -- on abandonne plutôt que de boucler : ne JAMAIS bloquer une inscription
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_referral_growth_code ON profiles;
CREATE TRIGGER trg_create_referral_growth_code
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_referral_growth_code();


-- ── 2. handle_new_user : profil + tenant + ATTRIBUTION ───────────────
--
-- ⚠️ Reprend À L'IDENTIQUE l'ancienne fonction (lue en production), et n'ajoute
-- que le bloc d'attribution à la fin. Rien n'est retiré.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referred_by_uuid UUID;
  ref_code TEXT;
  resolved_tenant_id UUID;
  signup_host TEXT;
  growth_code_input TEXT;
  matched_code_id UUID;
  matched_owner UUID;
BEGIN
  -- ── Ancien chemin, CONSERVÉ tel quel ──────────────────────────────
  -- `referred_by` reste renseigné le temps de la bascule : les anciennes
  -- colonnes ne disparaîtront qu'une fois le nouveau moteur vérifié.
  ref_code := NEW.raw_user_meta_data->>'referred_by_code';
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO referred_by_uuid
      FROM profiles
     WHERE referral_code = upper(ref_code)
     LIMIT 1;
  END IF;

  signup_host := NEW.raw_user_meta_data->>'signup_domain';
  IF signup_host IS NOT NULL AND signup_host != '' THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE domain = signup_host LIMIT 1;
  END IF;
  IF resolved_tenant_id IS NULL THEN
    SELECT id INTO resolved_tenant_id FROM tenants WHERE is_default = true LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, referred_by, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    referred_by_uuid,
    resolved_tenant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id);

  -- ── NOUVEAU : l'attribution dans le moteur unifié ─────────────────
  --
  -- UNE seule clé, `growth_code`, pour un parrain COMME pour un affilié. Il y
  -- en avait deux (`referral_code` posé par le lien, `affiliate_code` lu par la
  -- page d'abonnement) qui ne se rencontraient jamais : la chaîne d'affiliation
  -- était rompue, aucune commission n'a jamais été versée.
  --
  -- On tolère aussi l'ancienne clé, le temps que les cookies déjà posés chez
  -- les visiteurs expirent (30 jours).
  growth_code_input := COALESCE(
    NEW.raw_user_meta_data->>'growth_code',
    NEW.raw_user_meta_data->>'referred_by_code'
  );

  IF growth_code_input IS NOT NULL AND growth_code_input != '' THEN
    SELECT id, owner_user_id
      INTO matched_code_id, matched_owner
      FROM growth_codes
     WHERE upper(code) = upper(trim(growth_code_input))
       AND is_active = true
     LIMIT 1;

    -- Code inconnu → on ignore en silence (ne JAMAIS faire échouer une
    -- inscription pour un code invalide ou expiré).
    -- Anti auto-parrainage : on ne se parraine pas soi-même.
    IF matched_code_id IS NOT NULL
       AND (matched_owner IS NULL OR matched_owner <> NEW.id) THEN
      -- `referee_id` est UNIQUE : un marchand n'est attribué qu'une fois, à vie.
      INSERT INTO growth_attributions (code_id, referee_id)
      VALUES (matched_code_id, NEW.id)
      ON CONFLICT (referee_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Le trigger existant s'appelle `on_auth_user_created` (vérifié en production).
-- ⚠️ Ne PAS toucher à `ensure_auth_role_defaults`, l'autre trigger sur
-- auth.users : c'est le garde-fou qui empêche les comptes au rôle vide.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMIT;

NOTIFY pgrst, 'reload schema';
