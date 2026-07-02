# Load test — capacité Xeyo

Mesure le point de rupture du VPS (latence + saturation du pool Postgres).
Voir aussi [`docs/CAPACITE.md`](../../docs/CAPACITE.md).

## Installer k6

- **Windows** : `winget install k6 --source winget` (ou `choco install k6`)
- **macOS** : `brew install k6`
- **Linux** : https://k6.io/docs/get-started/installation/

## Lancer

```bash
# Charge nominale (safe, non-facturable) — monte à 50 VUs
k6 run -e BASE_URL=https://app.xeyo.io scripts/loadtest/k6-capacity.js

# Stress — pousse jusqu'à 200 VUs pour trouver la rupture
k6 run -e BASE_URL=https://app.xeyo.io -e PROFILE=stress scripts/loadtest/k6-capacity.js

# Spike — pic brutal (simule un afflux campagne)
k6 run -e BASE_URL=https://app.xeyo.io -e PROFILE=spike scripts/loadtest/k6-capacity.js
```

### Profils (`-e PROFILE=`)
`smoke` (5 VUs, 30s) · `load` (→50 VUs, défaut) · `stress` (→200 VUs) · `spike` (pic 200 VUs)

### Scénarios (`-e SCENARIO=`)
- **`safe`** (défaut) — tape le webhook GET (vérif Meta, aucune DB/IA) + la home
  SSR. **Non-facturable**, safe en prod.
- **`webhook`** — POST webhook = **hot path IA complet** (appels OpenAI RÉELS).
  ⚠️ **Staging uniquement**, avec clé OpenAI de test/mock. Jamais en prod.

## Ce qu'il faut lire

- `http_req_duration p(95)/p(99)` : quand ça explose → palier de saturation.
- `http_req_failed` : apparition de 5xx → pool DB saturé ou process qui rame.
- Le **palier de VUs** où ça arrive = ta **capacité réelle**.

En parallèle sur le VPS, corréler avec :
```sql
SELECT count(*) FROM pg_stat_activity;   -- connexions Postgres actives
```
et la CPU/RAM (`htop`).

Le résumé de fin est aussi écrit dans `scripts/loadtest/last-run-summary.json`.

## Interpréter (repères)

| p95 sous charge | Verdict |
|---|---|
| < 500 ms | 🟢 confortable au palier testé |
| 500–1500 ms | 🟡 acceptable, on approche des limites |
| > 1500 ms ou 5xx | 🔴 palier de rupture atteint → c'est ta capacité max |

> Après les quick wins (singleton client, cron parallèle, retry 429), relancer
> `stress` pour confirmer le nouveau plafond vs. l'ancien.
