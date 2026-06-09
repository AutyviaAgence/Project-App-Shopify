# App Shopify embedded (modèle Gorgias)

> Plan de la couche **embedded app** Shopify, par-dessus le backend existant
> (VPS OVH + Supabase + n8n). À coder comme un bloc distinct, après le cœur
> WhatsApp. Voir aussi [`COMPLIANCE.md`](COMPLIANCE.md) et [`../REFONTE_V2.md`](../REFONTE_V2.md).

---

## Prérequis Shopify Partner (à faire AVANT de coder S1)

Côté Shopify (https://partners.shopify.com), à préparer par le propriétaire :

1. **Compte Partner** (gratuit, micro-entreprise OK).
2. **Development store** (Stores → Add store → Development store) : boutique de
   test gratuite avec produits factices, pour tester l'app sans risque.
3. **Créer l'app** (Apps → Create app → manually) :
   - **App URL** : `https://shopify.autyvia.fr`
   - **Allowed redirection URL(s)** : `https://shopify.autyvia.fr/api/shopify/callback`
   - Noter le **Client ID** (API key) et le **Client secret** (API secret).
4. **Scopes minimum** : `read_products`, `read_content`, `read_shop`
   (ajouter `read_orders`, `read_customers` seulement si SAV sur commandes).

### Variables d'env à prévoir
```
SHOPIFY_API_KEY=            # Client ID
SHOPIFY_API_SECRET=         # Client secret
SHOPIFY_SCOPES=read_products,read_content,read_shop
SHOPIFY_APP_URL=https://shopify.autyvia.fr
```

À fournir pour coder/tester S1 : Client ID, Client secret, nom du dev store
(ex. `autyvia-dev.myshopify.com`).

---

## Principe

Autyvia devient une **embedded app** sur l'App Store Shopify. Même backend, même
logique métier WhatsApp. On ajoute uniquement une **couche Shopify** par-dessus :
OAuth, session tokens, UI embedded (Polaris dans l'admin Shopify), webhooks RGPD.

- La charte **Autyvia reste 100% sur autyvia.fr**.
- **Polaris** ne concerne QUE l'interface qui vit dans l'admin Shopify.
- Le cœur (RAG, agents, WhatsApp, Stripe) est déjà en place et réutilisé tel quel.

---

## Auto-configuration de l'agent (le cœur de la valeur)

Objectif : à l'install, l'agent se crée **quasi tout seul**. Pas de scraping —
on **pull les données via l'API Shopify**, proprement et avec consentement.

### Flux à l'install
1. Le marchand installe l'app, accepte les scopes OAuth.
2. **Synchro initiale automatique** juste après l'OAuth :
   - `read_products` → catalogue complet (produits, variantes, prix, stock, images)
   - `read_content` → pages custom (FAQ, livraison) **+** shop policies natives
     (CGV, retours, confidentialité). ⚠️ Chercher aux **deux** endroits
     (`read_content` ET `read_shop`/policies) pour ne rien rater.
   - `read_shop` → nom, devise, langue, zones de livraison
3. Construction automatique de la **knowledge base** de l'agent
   (embeddings dans Supabase → `knowledge_chunks` + pgvector, comme le RAG WhatsApp).
4. Agent opérationnel en quelques secondes.

### Scopes
- **Minimum (install standard)** : `read_products`, `read_content`, `read_shop`.
- **Ajoutés seulement si SAV sur commandes** : `read_orders`, `read_customers`
  (données perso → review Shopify plus stricte, cf. Protected Customer Data).

### Synchro temps réel
- Webhooks `products/update`, `products/create`, `products/delete`, etc.
  → garder la KB à jour automatiquement.

---

## Facturation

### Règles Shopify (vérifiées juin 2026)
- **Billing API obligatoire** pour les marchands venus de Shopify (pas de contournement).
- Commission : **0% jusqu'à 1M$ lifetime**, puis **15%** au-delà (lifetime, plus annuel).
- **2,9%** de frais de traitement + taxes applicables.
- **19$** d'inscription unique (frais partner).
- Exception (non pertinente à notre échelle) : >20M$/an via l'App Store ou
  >100M$ de CA total → 15% dès le 1er dollar.

### Modèle conseillé
- **Hybride** : abonnement + usage-based plafonné, pour refacturer le coût
  variable WhatsApp Cloud API au marchand.

### Réconciliation anti-double-facturation
Cas : un client paie en direct sur autyvia.fr, puis installe l'app Shopify.

Mécanisme :
1. Code de liaison généré côté autyvia.fr.
2. À l'OAuth Shopify, check dans Supabase si le compte a déjà un **abonnement
   direct actif**.
3. Si oui → **pas** de charge Billing API, on lie juste la boutique.
4. Si non → flux Billing API normal.
5. Champ **`billing_source`** (`direct` | `shopify`) sur le compte = source de vérité.

---

## Webhooks RGPD obligatoires (avant soumission App Store)

À implémenter ET vérifier l'abonnement, même sans collecte de données perso :
- `customers/data_request`
- `customers/redact`
- `shop/redact`

HTTPS obligatoire (✅), signature HMAC à vérifier.

---

## Ce qui est déjà prêt vs à construire

| Brique | État |
|--------|------|
| Backend VPS / Supabase / n8n | ✅ En place |
| RAG / embeddings (KB auto) | ✅ knowledge_chunks + pgvector |
| Système Stripe (pour billing_source) | ✅ En place |
| Shopify comme **outil d'agent** (produits, commandes) | ✅ lib/tools executeShopify |
| OAuth Shopify + session tokens | ❌ À construire |
| UI embedded **Polaris** | ❌ À construire |
| Auto-config agent à l'install | ❌ À construire |
| Billing API + réconciliation billing_source | ❌ À construire |
| 3 webhooks RGPD | ❌ À construire |

---

## Découpage en phases (bloc Shopify embedded)

> À faire APRÈS le cœur WhatsApp (agents simplifiés, templates, bascule 24h).

- **S1 — OAuth & session tokens** : install flow, vérif HMAC, stockage du shop
  + access_token (chiffré), champ `billing_source`.
- **S2 — Auto-config agent** : pull `read_products`/`read_content`/`read_shop`
  → création agent + KB (RAG). Webhooks de synchro produits.
- **S3 — UI Polaris embedded** : écrans dans l'admin Shopify (statut agent,
  config minimale, lien vers autyvia.fr pour le reste).
- **S4 — Billing API + réconciliation** : abonnement hybride, check abonnement
  direct, anti-double-facturation.
- **S5 — Webhooks RGPD + soumission** : 3 webhooks conformité, listing,
  privacy policy, revue Shopify.

---

## Points à vérifier au moment de coder

- `read_content` ne renvoie pas toujours les shop policies natives → croiser avec
  `read_shop`/endpoint policies.
- Protected Customer Data (depuis août 2025) : minimiser, chiffrer, masquer,
  registre de traitement si `read_customers`/`read_orders`.
- Session tokens (App Bridge) pour l'auth embedded, pas de cookies.
