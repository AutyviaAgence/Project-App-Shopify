# Refonte V2 — Chatbot E-commerce Shopify via WhatsApp Business API

> Fichier de référence pour la grande refonte. Branche de travail : `dev`.
> Ne jamais merger sur `master` sans validation complète.
> Voir aussi : [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) (validations Meta/Google/Shopify),
> [`docs/INFRA.md`](docs/INFRA.md), [`supabase/schema.sql`](supabase/schema.sql).

---

## Vision

Un **chatbot IA pour e-commerçants Shopify**, branché sur **WhatsApp Business API**,
qui répond automatiquement aux clients : produits, commandes, **SAV**, **retours**,
suivi de livraison, avec escalade humaine et respect des règles **opt-in / opt-out**.

---

## Architecture WhatsApp : IA + Templates (fenêtre 24h)

Règle Meta fondamentale qui structure toute l'app :

```
Client écrit          → fenêtre 24h OUVERTE → 🤖 IA répond librement
Silence > 24h         → fenêtre FERMÉE      → 📋 TEMPLATE obligatoire
Client répond template → fenêtre ROUVERTE   → 🤖 IA reprend la main
```

- **L'IA est le cœur** (≈90% des échanges, dans la fenêtre 24h).
- **Les templates** (pré-approuvés par Meta) servent à (r)ouvrir une conversation
  hors fenêtre : relances, notifs commande, campagnes (contact initié par le marchand).
- À construire : **bascule automatique** IA/template selon `last_message_at`.

---

## Décisions arrêtées

| Sujet | Décision |
|-------|----------|
| Canal | **WhatsApp Business API (WABA) uniquement** |
| Evolution API | ✅ Retiré (phase 1 faite) |
| Teams (équipes) | ✅ Retiré, user-only (code + DB faits) |
| Lifecycle | ✅ Déplacé dans Conversations (fait) |
| Email / Gmail | ❌ À retirer (fin) → supprime aussi la vérif OAuth Google sensible |
| Agents IA | Création **simplifiée** (à faire) |
| **Templates** | **À construire** : UI création + soumission Meta + statut |
| **Bascule IA/template 24h** | **À construire** |
| Campagnes WhatsApp + opt-out | ✅ Conservé (utilise les templates) |
| Abonnement / Stripe / quotas | ✅ Conservé |
| Multi-tenant (branding) | ✅ Conservé |
| Shopify | Intégration via **outils d'agent** (produits, commandes, SAV, retours) |
| Onboarding WhatsApp | Manuel d'abord → **Embedded Signup** après App Review |

---

## Sidebar cible

```
Dashboard
Conversations        ← IA + lifecycle + réponses
Sessions             ← connexion WhatsApp (manuel → Embedded Signup)
─────────────
Agents IA            ← simplifié
Modèles (Templates)  ← NOUVEAU : gestion templates Meta
Bibliothèque         ← docs + images (RAG)
Liens                ← liens WhatsApp trackés
─────────────
Campagnes            ← templates + opt-in
Stats
Settings
```

---

## État des phases

| # | Phase | Statut |
|---|-------|--------|
| 1 | Evolution API → WABA only | ✅ Fait |
| 2 | Teams → user-only (code + DB) | ✅ Fait |
| 3 | Lifecycle dans Conversations | ✅ Fait |
| — | Fix suppression user (FK referral) | ✅ Fait |
| 4 | **Simplifier les agents IA** | ⏳ À faire |
| 5 | **Templates** (UI + soumission Meta + statut) | ⏳ À faire |
| 6 | **Bascule IA / template** (fenêtre 24h) | ⏳ À faire |
| 7 | **Renforcer Shopify** (SAV, retours, commandes, opt-in) | ⏳ À faire |
| 8 | **Conformité** (privacy, mentions légales, suppression publique, webhooks RGPD Shopify) | ⏳ À faire |
| 9 | Retrait Email / Gmail | ⏸️ Fin |
| 10 | Embedded Signup Meta (après App Review) | ⏸️ Dépend de Meta |
| 11 | PostHog analytics | ⏸️ Plus tard |

---

## Détails par phase à venir

### Phase 4 — Simplifier les agents IA
Aujourd'hui : wizard 13 étapes + ~30 champs + studio + workflow canvas.
Cible : **fiche agent claire**, sections dépliables :
- **Qui il est** : nom, rôle, ton, langue (avancé : prompt, modèle, température)
- **Ce qu'il sait** : documents + images (RAG) + outils Shopify
- **Comment il réagit** : escalade, relance, booking, type d'agent
- **Où il est actif** : sessions WhatsApp + liens

### Phase 5 — Templates
- Table `whatsapp_templates` (nom, langue, catégorie, corps, variables, statut Meta).
- UI : créer / éditer / soumettre à Meta / suivre le statut (pending/approved/rejected).
- Client WABA : `sendTemplate()` existe déjà ; ajouter la création via Graph API.
- Prérequis pour l'App Review Meta (vidéo "créer un template").

### Phase 6 — Bascule IA / template
- À l'envoi sortant initié par le système : si dernier message entrant < 24h → IA libre,
  sinon → template obligatoire (sélection d'un template approuvé).
- Impacte : campagnes, relances, notifications.

### Phase 7 — Shopify renforcé
- Outils agents : statut commande, retours, stock, suivi livraison.
- Scénarios SAV / retours guidés.

### Phase 8 — Conformité (voir docs/COMPLIANCE.md)
- Pages : Politique de confidentialité, Mentions légales (CGU existe).
- Endpoint suppression de compte exposé publiquement (Meta Data Deletion).
- Webhooks RGPD Shopify (`customers/data_request`, `customers/redact`, `shop/redact`).

---

## Notes

- Stack : Next.js (App Router, TS) + Supabase self-hosted (VPS Dokploy) + OpenAI + WABA + Stripe
- Supabase : `https://supabase.autyvia.fr` · App : `https://shopify.autyvia.fr`
- ⚠️ Après chaque phase mergée : **rebuild l'app dans Dokploy** pour déployer.
