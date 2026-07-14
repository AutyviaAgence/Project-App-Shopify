-- Jetons Shopify EXPIRANTS (obligatoires depuis décembre 2025).
--
-- ⚠️ Shopify REFUSE désormais les jetons non-expirants sur l'Admin API :
--   403 « [API] Non-expiring access tokens are no longer accepted for the Admin API.
--        Start using expiring offline tokens. »
-- Tous nos appels Admin échouaient donc en 403 — y compris `{ shop { name } }` —
-- ce qui laissait shop_name/shop_email/currency vides et rendait la boutique
-- orpheline (aucun compte marchand créé).
--
-- Le token exchange doit passer `expiring: "1"` et Shopify renvoie alors :
--   · access_token   (durée de vie courte)
--   · refresh_token  (90 jours)
--   · expires_in     (secondes)
-- Il faut RAFRAÎCHIR avant expiration, sinon crons, webhooks et automatisations
-- tombent en 403 en silence.

alter table public.shopify_stores
  -- Jeton de rafraîchissement (90 j). Chiffré, comme l'access_token.
  add column if not exists refresh_token text,
  -- Expiration de l'access_token. NULL = jeton hérité non-expirant (invalide
  -- désormais) → force un nouveau token exchange à la prochaine occasion.
  add column if not exists token_expires_at timestamptz;

comment on column public.shopify_stores.refresh_token is
  'Jeton de rafraîchissement Shopify (90 j), chiffré. Requis depuis le passage aux tokens expirants.';
comment on column public.shopify_stores.token_expires_at is
  'Expiration de l''access_token. NULL = ancien jeton non-expirant, refusé par Shopify (403) → à ré-échanger.';

-- Les jetons NON-EXPIRANTS existants sont désormais REFUSÉS par Shopify : ils ne
-- servent plus à rien et donnent des 403 silencieux. On les efface pour forcer un
-- nouveau token exchange à la prochaine ouverture de l'app (ensure-store.ts).
update public.shopify_stores
   set access_token = '',
       token_expires_at = null
 where coalesce(access_token, '') <> ''
   and token_expires_at is null;

notify pgrst, 'reload schema';
