# Refonte V2 — Chatbot E-commerce Shopify via WhatsApp Business API

> Fichier de référence pour la grande refonte. Branche de travail : `dev`.
> Ne jamais merger sur `master` sans validation complète.

---

## Vision

Un **chatbot IA pour e-commerçants Shopify**, branché sur **WhatsApp Business API**, qui répond automatiquement aux clients :

- Questions produits / disponibilité / commandes
- **SAV** (support après-vente)
- **Retours de commandes**
- Suivi de livraison
- Escalade vers un humain quand nécessaire

Le tout en respectant les règles **opt-in / opt-out** de WhatsApp Business.

---

## Décisions arrêtées

| Sujet | Décision |
|-------|----------|
| Canal | **WhatsApp Business API (WABA) uniquement** |
| Evolution API | ❌ Retiré complètement |
| Email | ❌ Retiré complètement |
| Teams (équipes) | ❌ Retiré complètement → tout est `user_id` only |
| Lifecycle | ↪️ Déplacé **dans** la page Conversations (plus de page dédiée) |
| Agents IA | Création **simplifiée** |
| Campagnes WhatsApp + opt-out | ✅ Conservé (cohérent avec l'opt-in) |
| Abonnement / Stripe / quotas | ✅ Conservé |
| Multi-tenant (branding) | ✅ Conservé |
| Shopify | Intégration via **outils d'agent** (search_product, order_status, stock…) |

---

## Ce qu'on RETIRE (refonte code, phases dédiées)

### 1. Evolution API
- `src/lib/evolution/` (client, sync-contacts)
- `src/app/api/webhook/evolution/`
- `src/app/api/sessions/[id]/qr`, `sync-contacts`
- `vps-zombie-cleaner/`
- Colonnes DB : `whatsapp_sessions.instance_id`, `qr_code`, `pairing_code`
- Variables : `EVOLUTION_*`, `ZOMBIE_CLEANER_*`
- → Garder uniquement `src/lib/whatsapp-cloud/` + `src/app/api/webhook/waba/`

### 2. Email
- `src/app/api/email/`, `email-sessions/`, `oauth/gmail-session/`
- `src/app/api/cron/poll-email`, `renew-gmail-watch`
- `src/app/api/webhook/gmail-pubsub`
- `src/lib/email/`
- Table `email_sessions`, `email_session_teams`, colonne `conversations.email_session_id`

### 3. Teams
- `src/app/(dashboard)/teams/`, `src/app/api/teams/`, `src/lib/teams/`
- Tables : `teams`, `team_members`, `team_invitations`, `agent_teams`,
  `session_teams`, `document_teams`, `link_teams`, `campaign_teams`
- Colonne `team_id` sur 17 tables → à retirer
- RLS : simplifier toutes les policies en `user_id = auth.uid()`

### 4. Tags legacy
- `conversation_tags`, `conversation_tag_assignments` → remplacés par le lifecycle

---

## Ce qu'on DÉPLACE

### Lifecycle → dans les Conversations
- Retirer la page `src/app/(dashboard)/lifecycle/`
- Fusionner `src/app/api/lifecycle/*` dans `src/app/api/conversations/`
- Ajouter une section/onglet Lifecycle dans la page conversation
- **Garder les tables** : `lifecycle_stages`, `conversation_lifecycle_stages`, `lifecycle_history`

---

## Ce qu'on SIMPLIFIE

### Agents IA
Aujourd'hui : wizard 13 étapes + config manuelle ~30 champs + studio + workflow canvas.

Cible : **fiche agent claire**, sections dépliables, l'essentiel visible :
- **Qui il est** : nom, rôle, ton, langue (avancé : prompt, modèle, température)
- **Ce qu'il sait** : documents + images attachés (knowledge / RAG)
- **Comment il réagit** : escalade, relance, booking, type d'agent
- **Où il est actif** : sessions WhatsApp + liens rattachés

Outils Shopify intégrés à la section "Ce qu'il sait/fait".

---

## Périmètre cible de la base de données

Voir [`supabase/schema.sql`](supabase/schema.sql) — document de référence de la
structure cible (un seul fichier, les ~157 migrations ont été consolidées).

⚠️ Le `schema.sql` décrit l'état **voulu**. La base réelle (VPS) sera migrée
progressivement pendant la refonte (suppression des colonnes teams/email/evolution).

---

## Ordre d'implémentation (phases)

> Chaque phase est testée avant de passer à la suivante.

1. **Retirer Evolution** → WABA seul (sessions, webhook, envoi/réception)
2. **Retirer Email** → découplage conversations
3. **Retirer Teams** → RLS user-only (le plus lourd : 17 tables, 148 policies)
4. **Déplacer Lifecycle** dans les conversations
5. **Simplifier les Agents IA**
6. **Renforcer l'intégration Shopify** (SAV, retours, commandes, opt-in)
7. **Analytics PostHog** (voir [`docs/INFRA.md`](docs/INFRA.md))

---

## Notes

- Stack : Next.js (App Router, TS) + Supabase self-hosted (VPS Dokploy) + OpenAI
- Supabase : `https://supabase.autyvia.fr` (HTTPS Let's Encrypt)
- App : `https://shopify.autyvia.fr`
