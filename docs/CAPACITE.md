# Xeyo — Capacité d'accueil & Scaling

> Combien de marchands Xeyo peut encaisser aujourd'hui, où ça casse en premier,
> et quoi faire pour tenir 10×. Basé sur un audit du code (vérifié sur les points
> critiques) + les caractéristiques de l'infra actuelle (VPS unique Dokploy :
> Next.js + Postgres self-hosted + GoTrue sur la même machine).

---

## 1. Verdict rapide

| État | Marchands actifs | Statut |
|---|---|---|
| **Aujourd'hui (aucun changement)** | **5–15** | ✅ stable |
| Après **quick wins** (1 journée) | **30–50** | ✅ recommandé |
| Après **singleton client + PgBouncer** | **50–100** | ✅ confortable |
| Après **système de queue** (workers) | **200–500** | ✅ solide |
| Après **read replicas + HNSW** | **1000+** | ✅ entreprise |

> ⚠️ Le nombre qui compte n'est pas le nombre de comptes, mais la **concurrence** :
> combien de marchands reçoivent/répondent à des messages **en même temps**.
> 500 comptes dont 20 actifs simultanément ≈ charge de 20.

---

## 2. Les goulots d'étranglement (par sévérité)

### 🔴 CRITIQUE — Le cron des automations traite les jobs en série
**Fichier :** `src/app/api/cron/run-automations/route.ts:42-146`
**Casse vers :** 30+ marchands / 1 000+ jobs en attente

- La requête récupère les jobs dus avec `.limit(100)` puis les traite dans une
  **boucle `for` séquentielle**, avec **plusieurs requêtes DB par job** (charger
  l'automation, vérifier le contact, upsert conversation/message, MAJ statut).
- Si le volume dépasse 100 jobs par tick, le **backlog s'accumule** : chaque tick
  n'en traite que 100, les autres vieillissent.
- Exemple : 50 marchands × ~5 jobs/h = pics de 200+ jobs/fenêtre → seulement 100
  traités → relances en retard de 5–15 min.

**Quick win :** passer `.limit(100)` → `.limit(500)` et paralléliser le traitement
par batch (`Promise.all` sur des sous-lots de ~10). Débloque immédiatement 5–10×.

---

### 🟠 ÉLEVÉ — Un client Supabase admin créé à CHAQUE requête
**Fichiers :** ~185 fichiers instancient `createClient/createAdminSupabase` par
requête (ex. `run-automations/route.ts`, `webhook/waba/route.ts:79`,
`process-ai-response.ts:28`, `dispatch.ts`).
**Casse vers :** 50+ requêtes concurrentes

- Chaque instanciation = nouveau client HTTP + négociation de connexion Postgres
  (~50–100 ms). Postgres self-hosted tient ~100 connexions par défaut.
- À 20 msg/s entrants, ce sont ~20 connexions/s qui se disputent le pool → au-delà,
  les requêtes attendent (500 ms–2 s), puis Postgres **refuse** les nouvelles
  connexions.

**Quick win :** un **singleton** admin par process (`src/lib/supabase/admin-singleton.ts`),
réutilisé partout. −50 à −100 ms par requête, et surtout ça arrête d'épuiser le pool.

---

### 🟠 ÉLEVÉ — Réponse IA fire-and-forget sans retry sur 429
**Fichiers :** `src/app/api/webhook/waba/route.ts` (processAIResponse lancé sans
await) + `src/lib/openai/process-ai-response.ts`
**Casse vers :** 30–50 marchands / pics de charge IA

- Le webhook répond `200 OK` tout de suite et laisse l'IA tourner en arrière-plan.
  Bon pour la latence webhook, mais **aucune gestion du 429** (rate-limit OpenAI) :
  un échec est loggé et **perdu** (pas de file de retry).
- En pic, des réponses SAV disparaissent silencieusement.

**Quick win :** wrapper `withRetry()` (backoff exponentiel) autour des appels
`chat.completions.create` et `embeddings.create`. Sur 429 → réessai à 2s/4s/8s.

---

### 🟡 MOYEN-ÉLEVÉ — Polling email séquentiel par session
**Fichier :** `src/app/api/cron/poll-email/route.ts:56-223`
**Casse vers :** 50+ sessions email

- Les sessions tournent en parallèle (bien), mais **chaque email est traité en
  série** avec ~8 allers-retours DB (upsert contact, conversation, message,
  upload media, messages pièces jointes).
- 50 sessions × 5 emails × 8 requêtes = ~2 000 opérations en chaînes → risque de
  **timeout du cron** (~30 s).

**Quick win :** batch-insert des messages/pièces jointes par session
(`insert([...])` en une fois).

---

### 🟡 MOYEN — Pas de retry sur les embeddings (upload RAG)
**Fichier :** `src/lib/openai/embeddings.ts` + `src/lib/knowledge/processor.ts`
**Casse vers :** 100+ documents concurrents

- Un gros PDF → des centaines de chunks → plusieurs appels embeddings. Un 429 fait
  **échouer tout le document**. Plusieurs users qui uploadent en même temps →
  échecs.

**Quick win :** même `withRetry()` que ci-dessus sur `generateEmbeddings()`.

---

### 🟡 MOYEN — Campagnes : requêtes DB par destinataire
**Fichier :** `src/lib/campaigns/executor.ts:168-340`
**Casse vers :** 500+ destinataires / exécution

- Boucle séquentielle avec 3–4 requêtes par destinataire (session, contact,
  conversation, variantes de template). Pas un tueur de scale (throttlé par
  `messages_per_hour`), mais lent.

**Quick win :** pré-charger sessions/contacts en tête de campagne, puis cache.

---

### 🟢 FAIBLE — Chiffrement AES sur le hot path
**Fichier :** `src/lib/crypto/encryption.ts` (chaque message in/out chiffré/déchiffré)
**Casse vers :** 1 000+ msg/s

- AES-256-GCM est CPU-bound. Négligeable en dessous de ~100 msg/s. À surveiller
  seulement à très grande échelle. **Ne pas y toucher maintenant.**

---

## 3. Ce qui scale DÉJÀ bien (ne pas sur-investir)

| Composant | Fichier | Pourquoi c'est OK |
|---|---|---|
| Rate limiter in-memory | `src/lib/rate-limit/limiter.ts` | Suffisant en mono-instance |
| Validation signature webhook | `webhook/waba/route.ts` | Comparaison temps constant |
| File FIFO par session | `src/lib/messaging/session-queue.ts` | Anti-doublon, OK < 1000 sessions |
| Increments atomiques (RPC) | RPC Postgres (tokens, unread) | Pas de race, pas de N+1 |
| Batch embeddings (100 chunks) | `src/lib/knowledge/processor.ts` | Taille de lot raisonnable |

---

## 4. Plan de capacité chiffré (paliers)

### Palier 0 — Actuel : 5–15 marchands
- 1 VPS tout-en-un (Next.js + Postgres + GoTrue).
- Coût infra ≈ **16 €/mois** (voir `PRICING.md`).
- Suffisant pour la phase early / fondateurs.

### Palier 1 — Quick wins : 30–50 marchands (≈ 1 journée de dev)
Aucun nouveau serveur. On garde le même VPS.
1. Singleton admin client (`admin-singleton.ts`) — 1 h
2. Cron automations `.limit(500)` + traitement par batch parallèle — 2 h
3. `withRetry()` (backoff 429) sur OpenAI chat + embeddings — 2 h
4. Batch-insert du polling email — 2 h

→ **Plafond ×3 sans dépenser un euro d'infra.** À faire avant d'ouvrir les vannes
marketing.

### Palier 2 — PgBouncer : 50–100 marchands (≈ 1 jour)
- Déployer **PgBouncer** entre Next.js et Postgres (conteneur Docker).
- Mutualise les connexions Postgres : illimité côté app, plafonné (~100) côté DB.
- Coût : ~0 € (même VPS) ou petit bump RAM. **Meilleur rapport effort/gain.**

### Palier 3 — Séparer la DB + queue : 200–500 marchands
- **Postgres sur sa propre machine** (ou managed) → l'app ne partage plus la RAM/CPU.
- **Système de queue** (BullMQ/Redis ou workers) pour les automations : le cron
  *enfile*, N workers *dépilent* en parallèle. Scaling linéaire avec le nombre de
  workers.
- Coût : +1 VPS DB (~15–30 €/mois) + éventuellement Redis.

### Palier 4 — Replicas + HNSW : 1000+ marchands
- **Read replicas** Postgres pour les lectures lourdes (listes conversations, stats).
- Index **HNSW** sur pgvector pour la recherche RAG (~10× plus rapide).
- Filtrer `match_knowledge_chunks` par `user_id`/`store_id` (`retriever.ts:52-63`).
- Coût : multi-VPS ou passage managed (Supabase Cloud / Neon).

---

## 5. Les limites EXTERNES (indépendantes de ton serveur)

| Fournisseur | Limite | Impact |
|---|---|---|
| **OpenAI** | RPM/TPM selon le tier (tier bas ≈ 3 500 RPM sur mini) | 429 en pic → géré par `withRetry()`. Monte avec la dépense. |
| **WhatsApp (Meta)** | Palier msg/24h (1K→10K→100K→∞ selon qualité) + ~80 msg/s par numéro | **Par marchand** (chacun son numéro) → scale naturellement. Attention aux **campagnes broadcast** qui peuvent se faire throttle. |

Ces limites ne sont pas ton serveur : elles se règlent par tier OpenAI (auto) et
par qualité du numéro WhatsApp (par marchand).

---

## 6. Load test — méthodologie

Un script k6 sera fourni (`scripts/loadtest/`) pour trouver le **vrai point de
rupture** du VPS actuel. Cibles de test :

1. **Hot path webhook** (le plus coûteux : DB + IA) — le tester en mode *santé*
   (endpoint léger) pour ne PAS déclencher de vrais appels OpenAI facturés.
2. **Dashboard concurrent** (server components + routes API en lecture).
3. **Ramp-up progressif** (10 → 50 → 100 → 200 VUs) pour repérer où :
   - la latence P95 explose,
   - les erreurs 5xx apparaissent (pool DB saturé),
   - le cron déborde (tick > intervalle).

**Métriques clés à relever :** P50/P95/P99 latence, taux d'erreur, connexions
Postgres actives (`SELECT count(*) FROM pg_stat_activity;`), CPU/RAM du VPS.

> ⚠️ Le load test se fait sur **staging** ou en mode non-facturable. On ne tape
> jamais les vrais webhooks WhatsApp / OpenAI en prod avec du trafic synthétique.

---

## 7. Ordre d'action recommandé

1. **Faire les 4 quick wins** (palier 1) → 30–50 marchands, 0 € infra.
2. **Lancer le load test** pour confirmer le nouveau plafond réel.
3. **Ajouter PgBouncer** (palier 2) dès qu'on approche 40 marchands actifs.
4. Ne passer aux paliers 3–4 (queue, replicas) **que quand le load test le prouve**
   nécessaire — pas avant.

**À retenir :** l'app est bien architecturée pour la phase actuelle. Les correctifs
sont tactiques : un week-end de travail → 50 marchands ; une semaine → 500+.
Le seul piège serait d'ouvrir le marketing en grand **avant** les quick wins.
