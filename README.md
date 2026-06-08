# App Shopify — Chatbot WhatsApp Business API

Chatbot IA pour e-commerçants Shopify, branché sur **WhatsApp Business API (WABA)**.
Répond automatiquement aux clients : produits, commandes, **SAV**, **retours**, suivi
de livraison, avec escalade humaine et respect des règles **opt-in / opt-out**.

## Stack

- **Next.js** (App Router, TypeScript)
- **Supabase** self-hosted (Postgres + Auth + Storage + Realtime) sur VPS Dokploy
- **OpenAI** (agents IA, RAG via pgvector)
- **WhatsApp Business API** (Meta Cloud API)
- **Stripe** (abonnements, quotas tokens)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Configuration

Copier les variables d'environnement requises (voir le `.env`). Principales :

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `WABA_VERIFY_TOKEN`, `WABA_APP_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `MESSAGE_ENCRYPTION_KEY`, `CRON_SECRET`

## Documentation

- [`REFONTE_V2.md`](REFONTE_V2.md) — vision et plan de refonte
- [`supabase/schema.sql`](supabase/schema.sql) — structure cible de la base
- [`docs/INFRA.md`](docs/INFRA.md) — hébergement, accès DB, analytics
- [`PLAN_CAMPAIGNS.md`](PLAN_CAMPAIGNS.md) — système de campagnes WhatsApp
