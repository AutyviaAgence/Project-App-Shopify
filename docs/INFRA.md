# Infrastructure & Accès

> Notes techniques sur l'hébergement, l'accès DB et l'outillage.
> ⚠️ Ne pas committer de secrets ici. Les valeurs sensibles vivent dans le `.env`.

---

## Hébergement

| Élément | Valeur |
|---------|--------|
| VPS | `92.222.178.93` (déployé via **Dokploy**) |
| Supabase self-hosted | `https://supabase.autyvia.fr` (HTTPS Let's Encrypt) |
| App Next.js | `https://shopify.autyvia.fr` |
| Postgres | `supabase/postgres:15.x` (conteneur `app-shopify-supabase-*-db`) |
| Pooler | Supavisor, exposé sur le port `5432` de l'hôte |

---

## Accès à la base de données (CLI)

La base n'est **pas** exposée publiquement. Deux façons d'y accéder.

### Option A — Sur le VPS (terminal Dokploy / SSH)

```bash
docker exec -i app-shopify-supabase-<prefix>-db \
  psql "postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres" \
  -c "SELECT 1;"
```

(`127.0.0.1` à l'intérieur du conteneur `db` = le Postgres réel.)

### Option B — Depuis le PC via tunnel SSH (recommandé pour inspecter)

1. Ouvrir un tunnel depuis le PC :
   ```bash
   ssh -L 5433:127.0.0.1:5432 ubuntu@92.222.178.93
   ```
   (laisser la fenêtre ouverte)

2. Se connecter via le **pooler** (le port 5432 de l'hôte = Supavisor) :
   ```bash
   psql "postgresql://postgres.<POOLER_TENANT_ID>@127.0.0.1:5433/postgres"
   ```
   - Le username est `postgres.<POOLER_TENANT_ID>` (pas juste `postgres`) car on
     passe par le pooler.
   - Le mot de passe = `POSTGRES_PASSWORD` (dans le `.env` Dokploy de Supabase).

> Client requis : `postgresql-client` v15+ (la DB est en 15).

---

## Migration depuis Supabase Cloud (historique)

La base a été migrée de Supabase Cloud (Postgres 17) vers le VPS (Postgres 15).
Points retenus pour de futures migrations :

- Le **pg_dump doit être ≥ version du serveur source** (Cloud en 17 → pg_dump 17).
- La connexion **directe** Cloud (`db.<ref>.supabase.co`) n'a que de l'IPv6
  → inatteignable depuis Docker. Utiliser le **Session pooler**
  (`aws-X-region.pooler.supabase.com:5432`, username `postgres.<ref>`).
- Dumper `--schema=public` dans un **fichier** (pas un pipe) pour éviter qu'une
  erreur sur `auth`/`storage` n'interrompe le transfert.
- L'extension **pgvector** doit être activée sur la cible avant d'importer
  les tables d'embeddings (`knowledge_chunks`).
- Le **Storage** (fichiers) se migre séparément via l'API `@supabase/supabase-js`
  (les fichiers ne sont pas dans le dump SQL).

---

## À FAIRE PLUS TARD

### PostHog (analytics produit)

Objectif : tracker les stats d'usage de l'app (events, funnels, rétention,
features utilisées). À intégrer après la refonte.

Pistes d'implémentation :
- `posthog-js` côté front (Next.js) pour les events UI + pageviews
- `posthog-node` côté back pour les events serveur (messages envoyés, agents
  créés, conversions abonnement…)
- Option self-hosted PostHog sur le VPS (Dokploy) **ou** PostHog Cloud
- Variables d'env à prévoir : `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- Penser au consentement / RGPD (clients e-commerce)

> Voir aussi l'ordre d'implémentation dans [`../REFONTE_V2.md`](../REFONTE_V2.md).
