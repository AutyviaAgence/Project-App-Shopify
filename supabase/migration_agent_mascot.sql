-- ════════════════════════════════════════════════════════════════════════════
-- Mascotte personnalisable par agent IA
-- À exécuter dans le SQL Editor de Supabase. Idempotent.
--
-- Ajoute deux colonnes a ai_agents :
--   - mascot     : cle de la mascotte choisie (buste | envelope | phone | selfie)
--   - mascot_bg  : cle de la couleur de fond / halo (green | blue | violet | coral | amber | sky)
-- NULL = valeurs par defaut cote UI (mascotte selon le type d'agent).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS mascot text;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS mascot_bg text;
