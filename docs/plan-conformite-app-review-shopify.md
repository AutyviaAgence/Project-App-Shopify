# Plan — Conformité App Review Shopify (Xeyo)

> **Verdict de l'audit : l'app serait REJETÉE en l'état.**
> 5 blocages de review + 1 bug de sécurité en production.
> Ce plan les traite par ordre de criticité. Chaque lot est autonome et livrable seul.

---

## LOT 0 — 🔴 SÉCURITÉ (à faire immédiatement, indépendant de la review)

### Bug : `customers/redact` supprime les contacts CROSS-TENANT

`src/app/api/shopify/webhooks/customers-redact/route.ts:33-38`
```ts
await supabase.from('contacts').delete().eq('phone_number', phone)
await supabase.from('contacts').delete().eq('email', email)
```
**Aucun filtre sur la boutique.** Un `customers/redact` de la boutique A supprime les
contacts de **tous les marchands** ayant ce numéro/email. Destruction de données
cross-tenant → incident RGPD ET perte de données client.

**Fix** : scoper la suppression au `user_id` du marchand (via `shop_domain` →
`shopify_stores.user_id` → `whatsapp_sessions` → `contacts.session_id`).

**Effort** : ~15 min. **À faire en premier, quoi qu'il arrive.**

---

## LOT 1 — 🔴 FACTURATION (blocage n°1 de la review)

### Le problème (circulaire)
| Étape | Fichier:ligne | Effet |
|---|---|---|
| Install App Store | `api/shopify/callback/route.ts:102` | pose `billing_source: 'direct'` |
| Connect manuel | `api/shopify/connect/route.ts:48` | pose `billing_source: 'direct'` |
| Onboarding | `onboarding/page.tsx:497` | `if (billingSource === 'shopify')` → **jamais vrai** |
| Fallback | `onboarding/page.tsx:509` | → **Stripe Checkout** |

→ **100 % des marchands App Store sont facturés par Stripe.** Violation de la Partner
Program Agreement. Rejet automatique.

`billing_source: 'shopify'` n'est écrit qu'APRÈS un abonnement Shopify réussi
(`billing/subscribe:84`) : il faudrait déjà y être pour y arriver.

### Fix
1. **`callback/route.ts:102`** : poser `billing_source: 'shopify'` (installation depuis
   Shopify ⇒ Shopify Billing, toujours). `'direct'` réservé aux comptes créés hors Shopify.
2. **`connect/route.ts:48`** : idem — relier une boutique Shopify ⇒ `'shopify'`.
3. **Bloquer Stripe** pour tout user ayant une boutique Shopify liée :
   - garde serveur sur `api/stripe/create-checkout`, `buy-ai-credits`, `buy-tokens`
   - masquer les CTA Stripe dans `(dashboard)/subscription/page.tsx:227, 545`
4. **Crédits IA / tokens** : implémenter `appPurchaseOneTimeCreate` (Shopify) en
   parallèle des routes Stripe (aujourd'hui **aucun équivalent** → 2ᵉ motif de rejet).
5. **Bug de contrat API** : `billing/subscribe:89` renvoie `{data:{confirmationUrl}}`
   mais `onboarding/page.tsx:503` lit `json.confirmationUrl` → corriger.
6. **Facturation annuelle** : l'onboarding envoie `billing:'annual'` mais Shopify Billing
   ne gère que `EVERY_30_DAYS` → soit implémenter `ANNUAL`, soit retirer l'option
   pour les marchands Shopify.

**Ce qui est DÉJÀ bon** : mutation `appSubscriptionCreate` correcte (`client.ts:739`),
flag `test:` correct, vérification anti-forge du callback.

**Effort** : ~2-3 h (la plomberie existe, c'est du routage + gardes + 1 mutation).

---

## LOT 2 — 🔴 APP BRIDGE (blocage majeur)

`embedded = true` dans le toml, **mais** :
- Aucune dépendance `@shopify/app-bridge*` (`package.json`)
- Aucun session token / vérification JWT `id_token`
- L'auth repose sur les **cookies Supabase**, qui ne passent pas dans l'iframe
- Le code **s'échappe de l'iframe** (`app/shopify/client.tsx:53-61`,
  `window.top.location.href`) — pattern explicitement non conforme
- Les liens ouvrent `target="_blank"` vers `app.xeyo.io` → l'app **sort** de l'admin

**Fix** :
1. Installer `@shopify/app-bridge-react`
2. Auth par **session token** sur toutes les routes appelées depuis `/shopify`
3. Supprimer l'échappement d'iframe ; faire vivre l'app DANS l'admin

**Alternative à évaluer** : passer l'app en **non-embedded** (`embedded = false`).
Shopify l'autorise, c'est beaucoup moins de travail, mais l'expérience est moins bonne
et certaines catégories de l'App Store poussent fortement l'embedded.

**Effort** : ~1-2 jours (embedded) ou ~1 h (bascule non-embedded).
👉 **Décision produit à prendre avant de coder.**

---

## LOT 3 — 🔴 WEBHOOKS RGPD (déclaration manquante)

Les 3 routes existent et vérifient le HMAC ✅, mais le bloc `[webhooks]` du toml
(`shopify.app.xeyo-whatsapp-support-chat.toml:22-23`) ne contient **que**
`api_version`. **Aucune `[[webhooks.subscriptions]]`** → Shopify **refuse la soumission**.

**Fix** : déclarer dans le toml (ou le Partner Dashboard) :
- `customers/data_request` → `/api/shopify/webhooks/customers-data-request`
- `customers/redact` → `/api/shopify/webhooks/customers-redact`
- `shop/redact` → `/api/shopify/webhooks/shop-redact`
- `app/uninstalled` → `/api/shopify/webhooks/app-uninstalled`

⚠️ `customers/data_request` répond 200 **sans fournir de données** alors que `contacts`
stocke des phone/email d'acheteurs → à implémenter réellement (export des données).

**Effort** : ~30 min (toml) + ~1 h (data_request réel).

---

## LOT 4 — 🟠 SCOPES & CONFIG

1. **`read_discounts` inutilisé** (toml:10) → à retirer (Shopify rejette les scopes superflus).
2. **Divergence dangereuse** : `lib/shopify/client.ts:27` (`SHOPIFY_SCOPES` par défaut)
   ne contient **pas** `read_discounts`/`write_discounts`, alors que le toml les demande.
   `buildAuthUrl` utilise la valeur du code → **les scopes demandés à l'OAuth diffèrent
   du toml** → la création de codes promo (action IA) **échouera en 403 en prod**.
   → Aligner `client.ts:27` sur le toml.
3. **`shopify.app.toml` racine = config fantôme** (`client_id` différent `328a…`,
   `application_url = shopify.dev/apps/default-app-home`, `scopes = ""`).
   Si la CLI le sélectionne, le déploiement casse. → **Supprimer ce fichier.**

**Effort** : ~30 min.

---

## LOT 5 — 🟡 FINITIONS

| Point | Fichier | Fix |
|---|---|---|
| URLs privacy/support absentes du toml | toml | Ajouter `privacy_policy_url` + URL de support |
| State OAuth non appliqué (warn seulement) | `shopify/callback:42-46` | Rejeter si le state ne matche pas |
| Managed install déclaré mais code = OAuth classique | toml:12 vs `client.ts:86` | Choisir : soit token exchange, soit `use_legacy_install_flow = true` |
| `node_modules` commités dans `extensions/xeyo-thankyou-optin/` | — | `.gitignore` + purge |

**Effort** : ~1 h.

---

## ORDRE RECOMMANDÉ

1. **LOT 0** (sécurité cross-tenant) — *immédiat, 15 min, indépendant*
2. **LOT 1** (facturation) — *le blocage n°1, plomberie déjà là*
3. **LOT 3** (webhooks toml) — *rapide, bloque la soumission*
4. **LOT 4** (scopes/config) — *rapide, évite un 403 en prod*
5. **LOT 2** (App Bridge) — *le plus lourd → décider embedded vs non-embedded d'abord*
6. **LOT 5** (finitions)

---

## DÉCISION À PRENDRE AVANT DE CODER

**App embedded ou non ?**
- **Embedded** (App Bridge) : meilleure UX, attendu par Shopify, mais ~1-2 j de travail
  et refonte de l'auth (session tokens partout).
- **Non-embedded** : `embedded = false`, l'app s'ouvre dans un onglet. Conforme,
  ~1 h de travail. Moins « natif » mais parfaitement accepté.

👉 **À trancher avant le LOT 2.**
