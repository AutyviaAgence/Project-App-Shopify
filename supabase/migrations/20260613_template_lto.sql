-- =====================================================================
--  MIGRATION — Templates "Limited-Time Offer" (offre à durée limitée)
--  Date : 2026-06-13
--
--  Type de template marketing Meta avec un composant LIMITED_TIME_OFFER :
--  un titre d'offre + un compte à rebours natif WhatsApp jusqu'à une date
--  d'expiration (fournie à l'ENVOI), généralement couplé à un bouton COPY_CODE
--  (code promo) et/ou un bouton URL.
--
--  template_type accepte désormais : 'standard' | 'carousel' | 'limited_time_offer'
--
--  lto_title : titre de l'offre affiché au-dessus du compte à rebours
--    (ex : « -10% pendant 2h »). Max 16 caractères côté Meta.
--  lto_default_hours : durée par défaut (heures) utilisée pour calculer
--    l'expiration à l'envoi quand l'automation/campagne n'en fournit pas.
-- =====================================================================

BEGIN;

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS lto_title TEXT,
  ADD COLUMN IF NOT EXISTS lto_default_hours INTEGER DEFAULT 24;

COMMIT;
