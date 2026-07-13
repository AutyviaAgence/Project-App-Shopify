-- Journal d'audit des accès aux données personnelles (RGPD art. 30 & 32).
--
-- Déclaré à Shopify (Protected Customer Data → « Tenez-vous un journal de l'accès
-- aux données personnelles ? » → Oui).
--
-- ⚠️ Ce n'est PAS `webhook_logs` : celui-ci trace les payloads entrants (du
-- technique). Ici on trace QUI a accédé à QUELLES données personnelles, QUAND.
--
-- Ce qu'on journalise : les accès à VOLUME ou à RISQUE — export de contacts,
-- listing en masse, effacement RGPD, accès admin au compte d'un marchand.
-- Ce qu'on ne journalise PAS : l'ouverture d'une conversation par son
-- propriétaire légitime. Tracer chaque affichage produirait des millions de
-- lignes sans valeur d'audit, et ferait de cette table le nouveau goulot.

create table if not exists public.data_access_log (
  id uuid primary key default gen_random_uuid(),

  -- QUI. NULL = système (cron, webhook Shopify) : un accès non humain reste un
  -- accès, et doit rester traçable.
  actor_id    uuid,
  actor_email text,
  -- 'user'   : le marchand accède à ses propres données
  -- 'admin'  : un admin Xeyo accède aux données d'un marchand (le cas sensible)
  -- 'system' : cron, webhook, purge automatique
  actor_role  text not null default 'user',

  -- QUOI. 'export' | 'bulk_read' | 'erasure' | 'admin_access'
  action      text not null,
  -- Table ou domaine concerné : 'contacts', 'conversations', 'messages'…
  resource    text not null,
  -- Volume de personnes concernées. C'est LE chiffre qui compte en cas d'incident.
  record_count integer,

  -- SUR QUI. Le compte marchand dont les données ont été touchées.
  target_user_id uuid,
  -- Contexte libre (filtres de l'export, shop_domain, motif…). Ne JAMAIS y mettre
  -- de donnée personnelle : ce journal doit pouvoir être conservé plus longtemps
  -- que les données qu'il décrit.
  metadata    jsonb,

  ip          text,
  created_at  timestamptz not null default now()
);

-- Les deux questions qu'on pose à un journal d'audit : « qu'a fait cet acteur ? »
-- et « qui a touché aux données de ce marchand ? »
create index if not exists data_access_log_actor_idx  on public.data_access_log (actor_id, created_at desc);
create index if not exists data_access_log_target_idx on public.data_access_log (target_user_id, created_at desc);
create index if not exists data_access_log_created_idx on public.data_access_log (created_at desc);

comment on table public.data_access_log is
  'Journal d''audit RGPD : accès à volume ou à risque aux données personnelles. Écrit par le service role uniquement ; jamais purgé par la rétention.';

-- RLS : personne ne lit ni n'écrit ce journal via l'API publique. Seul le service
-- role (qui bypasse RLS) y touche. Un journal d'audit modifiable par ses sujets
-- ne vaut rien.
alter table public.data_access_log enable row level security;

notify pgrst, 'reload schema';
