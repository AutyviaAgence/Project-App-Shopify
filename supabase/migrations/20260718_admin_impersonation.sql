-- Journal d'impersonation admin.
--
-- Chaque fois qu'un admin « se connecte en tant que » un utilisateur, on ouvre
-- une ligne ici (started_at). Quand il revient à son compte, on la ferme
-- (ended_at). C'est la trace exigée : qui, sur qui, quand, depuis quelle IP.
--
-- ⚠️ AUCUNE policy RLS d'écriture : la table n'est jamais touchée que par le
-- service_role (routes serveur start/stop). Un utilisateur ne doit ni lire ni
-- écrire le journal d'impersonation.
create table if not exists public.admin_impersonation_log (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  ip            text,
  user_agent    text,
  -- Anti-auto-impersonation : un admin ne s'impersonne pas lui-même.
  constraint impersonation_not_self check (admin_id <> target_user_id)
);

-- Retrouver rapidement la session active d'un admin (celle sans ended_at).
create index if not exists idx_impersonation_admin_active
  on public.admin_impersonation_log (admin_id)
  where ended_at is null;

create index if not exists idx_impersonation_target
  on public.admin_impersonation_log (target_user_id, started_at desc);

alter table public.admin_impersonation_log enable row level security;
-- Pas de policy → service_role uniquement (bypass RLS), personne d'autre.

comment on table public.admin_impersonation_log is
  'Journal des sessions d''impersonation admin (support). Écrit par le service_role uniquement.';
