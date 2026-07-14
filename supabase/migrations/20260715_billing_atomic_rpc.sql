-- =====================================================================
--  CRÉDITS ATOMIQUES — tokens et conversations IA
--  2026-07-15
--
--  ── LE BUG QUE CES FONCTIONS SUPPRIMENT ─────────────────────────────
--
--  Le webhook de paiement créditait ainsi :
--
--      SELECT tokens_extra FROM profiles WHERE id = ...   -- lit 0
--      UPDATE profiles SET tokens_extra = 0 + 500000       -- écrit 500 000
--
--  C'est un « lire-puis-écrire » non atomique. Si deux paiements arrivent en
--  même temps (achat + parrainage, ou un simple retry de webhook), les deux
--  lisent 0, les deux écrivent 500 000 — et le marchand est crédité UNE seule
--  fois au lieu de deux. Il a payé deux fois. L'argent est perdu, en silence.
--
--  Un `UPDATE ... SET x = x + n` est atomique : Postgres verrouille la ligne le
--  temps de l'opération. Deux appels concurrents s'enchaînent au lieu de
--  s'écraser.
-- =====================================================================

BEGIN;

-- ── Tokens IA (achat ponctuel) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION credit_tokens_extra(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_tokens_extra: montant invalide (%)', p_amount;
  END IF;

  UPDATE profiles
     SET tokens_extra = COALESCE(tokens_extra, 0) + p_amount
   WHERE id = p_user_id
  RETURNING tokens_extra INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_tokens_extra: profil introuvable';
  END IF;

  RETURN v_new;
END $$;

-- ── Conversations IA (achat ponctuel, ou récompense de repli) ────────
CREATE OR REPLACE FUNCTION credit_ai_conversations(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_ai_conversations: montant invalide (%)', p_amount;
  END IF;

  UPDATE profiles
     SET ai_conversations_extra = COALESCE(ai_conversations_extra, 0) + p_amount
   WHERE id = p_user_id
  RETURNING ai_conversations_extra INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_ai_conversations: profil introuvable';
  END IF;

  RETURN v_new;
END $$;

-- ⚠️ SECURITY DEFINER = ces fonctions s'exécutent avec les droits de leur
-- propriétaire, donc elles CONTOURNENT la RLS. Il est impératif qu'un client
-- authentifié ne puisse pas les appeler : il s'auto-créditerait des tokens.
-- Seul le serveur (service_role) y a accès.
REVOKE ALL ON FUNCTION credit_tokens_extra(UUID, BIGINT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION credit_ai_conversations(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
