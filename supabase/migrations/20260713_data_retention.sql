-- Rétention des données personnelles (RGPD art. 5.1.e — limitation de conservation).
--
-- Distinct du droit à l'effacement (art. 17), déjà couvert par les webhooks
-- customers/redact : ici il s'agit de NE PAS CONSERVER les données plus longtemps
-- que nécessaire, automatiquement, sans que personne n'ait à le demander.
--
-- Purge par le cron /api/cron/run-retention.

alter table public.platform_settings
  -- Durée de conservation des messages, en JOURS. 0/NULL = rétention illimitée
  -- (l'ancien comportement) : on ne veut pas qu'une migration efface des données
  -- en silence, donc l'admin doit activer la purge explicitement.
  add column if not exists message_retention_days integer,
  -- Durée de conservation des logs techniques (webhook_logs), en JOURS. Ces logs
  -- contiennent des payloads Meta/Shopify avec des numéros de téléphone : ils
  -- méritent une rétention plus COURTE que les conversations métier.
  add column if not exists log_retention_days integer;

comment on column public.platform_settings.message_retention_days is
  'Conservation des messages en jours. 0/NULL = illimitée (purge désactivée).';
comment on column public.platform_settings.log_retention_days is
  'Conservation des webhook_logs en jours. 0/NULL = illimitée (purge désactivée).';

-- Défauts posés à l'activation : 24 mois pour les conversations (assez pour le SAV
-- et l'historique client), 90 jours pour les logs techniques (assez pour déboguer).
-- On ne les applique QUE si la colonne est vide, pour ne rien écraser.
update public.platform_settings
   set message_retention_days = coalesce(message_retention_days, 730),
       log_retention_days     = coalesce(log_retention_days, 90)
 where id = 1;

-- La purge balaie par date : sans ces index elle ferait un seq scan sur les deux
-- plus grosses tables de la base à chaque passage.
create index if not exists messages_created_at_idx
  on public.messages (created_at);
create index if not exists webhook_logs_created_at_idx
  on public.webhook_logs (created_at);

notify pgrst, 'reload schema';
