-- Config GLOBALE plateforme (réservée à l'admin Xeyo, pas aux marchands).
-- Une seule ligne (id = 1). Sert de home aux réglages de sécurité de la
-- plateforme, à commencer par le plafond anti-spam de fréquence marketing :
-- c'est la WABA de Xeyo qui porte le risque qualité Meta, donc c'est l'admin
-- (et non chaque marchand) qui fixe ce plafond.
create table if not exists public.platform_settings (
  id integer primary key default 1,
  -- Plafond de fréquence marketing par contact, en HEURES (au plus 1 message
  -- marketing par contact dans cette fenêtre). 0 = désactivé. NULL = utiliser le
  -- fallback env/défaut côté code.
  marketing_contact_cap_hours integer,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Garantit l'unicité de la ligne de config (singleton).
  constraint platform_settings_singleton check (id = 1)
);

-- Ligne unique amorcée avec le défaut historique (20h). L'admin peut la changer
-- depuis /admin sans redéploiement.
insert into public.platform_settings (id, marketing_contact_cap_hours)
values (1, 20)
on conflict (id) do nothing;

comment on table public.platform_settings is
  'Config globale plateforme (admin Xeyo). Singleton id=1.';
comment on column public.platform_settings.marketing_contact_cap_hours is
  'Plafond fréquence marketing/contact en heures. 0 = désactivé, NULL = fallback code.';

-- Recharge le cache de schéma PostgREST pour que l''API voie la nouvelle table.
notify pgrst, 'reload schema';
