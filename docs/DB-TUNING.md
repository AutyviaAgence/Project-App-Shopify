# Tuning DB — passer de ~30-50 à ~100 marchands (mono-VPS 12 Go)

> Diagnostic vérifié en prod (2026-07) : le goulot n'est PAS le pooling
> (Supavisor est déjà en place) mais **`max_connections = 100`, dont ~60 déjà
> consommées au repos** (50 idle) par le stack Supabase lui-même. Et Postgres
> tourne avec les **réglages d'usine** (`shared_buffers = 128 Mo`) alors que le
> VPS a **12 Go de RAM**. On corrige les deux. Aucune modif de code applicatif.

## Pourquoi (le raisonnement)

- Chaque connexion Postgres = 1 process (~5-10 Mo RAM). À 100 connexions, ~1 Go.
- Le stack Supabase (Supavisor 25, Realtime, PostgREST, Auth, Storage, pg_cron,
  pg_net, TimescaleDB) consomme déjà ~60 connexions **sans trafic**. À 30-50
  marchands actifs → dépassement des 100 avant même de saturer le CPU.
- `shared_buffers = 128 Mo` sur 12 Go de RAM = Postgres n'utilise ~1 % de la RAM
  pour son cache → beaucoup de lectures disque évitables.

## Valeurs cibles (calculées pour 12 Go)

Règle : `RAM ≈ shared_buffers + (max_connections × ~10 Mo) + marge OS/app`.
Budget prudent (l'app Next.js + Supavisor + le reste tournent sur la même
machine, on ne donne pas toute la RAM à Postgres) :

| Paramètre | Actuel | Cible | Justification (12 Go) |
|---|---|---|---|
| `max_connections` | 100 | **300** | 300 × 10 Mo ≈ 3 Go — large marge |
| `shared_buffers` | 128 Mo | **3 Go** | ~25 % de la RAM (recommandation Postgres) |
| `effective_cache_size` | 128 Mo | **8 Go** | ~66 % (estimation du cache OS dispo) |
| `work_mem` | 4 Mo | **16 Mo** | par opération de tri/hash ; prudent vu max_connections |
| `maintenance_work_mem` | 64 Mo | **512 Mo** | VACUUM / CREATE INDEX plus rapides |

Budget RAM Postgres ≈ 3 Go (buffers) + ~3 Go (connexions) = ~6 Go → il reste
~6 Go pour Next.js + Supavisor + OS. Confortable.

> ⚠️ `work_mem` est **par opération**, pas global. 300 connexions × 16 Mo en pic
> théorique = 4,8 Go. En pratique on est très loin (peu de tris simultanés), mais
> ne pas monter work_mem beaucoup plus haut avec un max_connections élevé.

## Comment appliquer (VPS Dokploy, conteneur Postgres 15)

Le Postgres tourne dans le conteneur `app-shopify-supabase-<prefix>-db`
(voir docs/INFRA.md). Deux options.

### Option A — via la config du conteneur (recommandé, persistant)

Dans Dokploy, sur le service Postgres de Supabase, passer ces paramètres au
démarrage (command `postgres -c ...`) OU les ajouter dans le `postgresql.conf`
monté. Exemple de flags :
```
-c max_connections=300
-c shared_buffers=3GB
-c effective_cache_size=8GB
-c work_mem=16MB
-c maintenance_work_mem=512MB
```
Puis **redémarrer le conteneur** Postgres. (Le changement de `max_connections`
et `shared_buffers` nécessite un restart, pas juste un reload.)

### Option B — en SQL (ALTER SYSTEM) puis restart

En SSH sur le VPS :
```bash
docker exec -i app-shopify-supabase-<prefix>-db \
  psql "postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres" <<'SQL'
ALTER SYSTEM SET max_connections = 300;
ALTER SYSTEM SET shared_buffers = '3GB';
ALTER SYSTEM SET effective_cache_size = '8GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
SQL
# puis redémarrer le conteneur Postgres (Dokploy → restart) pour appliquer
```
> `ALTER SYSTEM` écrit dans `postgresql.auto.conf`. Certains images Supabase
> régénèrent la config au boot ; si les valeurs ne tiennent pas après restart,
> utiliser l'Option A (flags de démarrage).

## Vérifier après restart

```sql
SHOW max_connections;      -- doit afficher 300
SHOW shared_buffers;       -- 3GB
SELECT count(*) FROM pg_stat_activity;  -- suivre la montée sous charge réelle
```

## Tuning Supavisor (le pooler déjà en place)

Supavisor multiplexe les connexions PostgREST→Postgres. Son `default_pool_size`
définit combien de connexions Postgres il garde par tenant. Sur le service
Supavisor (Dokploy), variables d'env typiques :
- `POOLER_DEFAULT_POOL_SIZE` (souvent défaut 20) → monter à **40-50** une fois
  `max_connections` relevé, pour laisser plus de connexions réutilisables.
- `POOLER_MAX_CLIENT_CONN` → nombre de clients côté app acceptés (large, ex. 200).

⚠️ Régler le pool Supavisor APRÈS avoir monté `max_connections` (sinon Supavisor
réserverait plus que ce que Postgres autorise → erreurs de connexion).

## Ordre d'exécution recommandé

1. Monter `max_connections` + mémoire Postgres (Option A ou B) → restart.
2. Vérifier `SHOW max_connections` = 300, app OK.
3. Monter le `default_pool_size` de Supavisor → restart Supavisor.
4. Surveiller `pg_stat_activity` quelques jours sous vrai trafic.

## Sécurité (fait)

Le script obsolète `scripts/migrate-db.mjs` (qui pointait vers l'ancienne
Supabase Cloud avec un mot de passe en clair) a été **supprimé**. ⚠️ Le mot de
passe reste dans l'historique git — le **révoquer/changer** côté Supabase Cloud
si ce compte existe encore, par sécurité.
