# Xeyo — Guide de review / publication de l'app Shopify

> ⚠️ **Ce document n'est plus la source de vérité.** Voir
> [`SHOPIFY_COMPLIANCE.md`](SHOPIFY_COMPLIANCE.md), qui fait autorité sur la
> conformité (facturation, webhooks RGPD, GraphQL, scopes, auth embedded).
> En cas de contradiction, c'est l'autre qui a raison — notamment sur les
> **scopes ci-dessous, qui sont périmés** (`read_discounts` a été retiré).
> Ce fichier reste utile pour les liens Dashboard et la procédure Protected
> Customer Data.

Ce document récapitule **tout ce qu'il faut faire** pour passer la review Shopify
et publier l'app (App Store ou distribution personnalisée), ainsi que les
réglages de données client protégées (Protected Customer Data).

App : **Xeyo — WhatsApp Support & Chat**
Client ID : `7510fef84b3b8bd4440344e9f6b626d4`
Dev Dashboard : https://dev.shopify.com/dashboard/221859836/apps/379385053185
Partner Dashboard : Apps → Xeyo

---

## 1. Scopes OAuth demandés

Déclarés dans `shopify.app.xeyo-whatsapp-support-chat.toml` :

```
read_customers, read_discounts, write_discounts,
read_orders, write_orders, read_products, read_content
```

| Scope | Pourquoi |
|-------|----------|
| `read_customers` | Lire les infos clients (nom, téléphone) pour le SAV et l'opt-in |
| `read_orders` | Lire les commandes (statut, téléphone) pour notifs + pré-remplissage opt-in |
| `write_orders` | Annuler des commandes (action IA validée par le marchand) |
| `read_discounts` / `write_discounts` | Créer des codes promo (action IA validée) |
| `read_products` | Catalogue produits pour l'agent IA |
| `read_content` | Pages/politiques de la boutique pour l'agent IA |

---

## 2. Protected Customer Data (DONNÉES CLIENT PROTÉGÉES) — OBLIGATOIRE

Depuis 2023, l'accès au **téléphone/email/adresse** des commandes via l'Admin API
nécessite une **approbation**. Sans ça → erreur :
> "This app is not approved to access the Order object."

### Où : Partner Dashboard → app Xeyo → **Demandes d'accès à l'API**

### Niveau requis
- **Protected customer data** (Level 1) : nom, email, **téléphone**, adresse → REQUIS
  (le téléphone sert au pré-remplissage opt-in + notifications)

### Raisons à cocher (justifiées)
- ☑️ **Service client** — répondre aux clients via WhatsApp/email pour le marchand
- ☑️ **Fonctionnalité de l'application** — pré-remplir l'opt-in, envoyer les notifs
- ☑️ **Marketing ou publicité** — notifications de commande + offres promo (avec opt-in)

### Justifications à fournir (texte type, EN)
> Xeyo is a customer support and notification app for merchants on WhatsApp and
> email. We need access to customer phone numbers and order data to:
> 1. Pre-fill the WhatsApp opt-in field on the order confirmation page.
> 2. Send transactional notifications (order confirmation, shipping, delivery)
>    on the channel the customer opted into.
> 3. Power the AI support agent that answers customer questions about their orders.
> All messages require explicit opt-in consent, stored with timestamp/source, and
> customers can opt out anytime by replying STOP.

### Champs client protégés à activer (+ raisons par champ)
Chaque champ demande de re-cocher les raisons. Configuration retenue :

| Champ | Service client | Fonctionnalité | Marketing | Usage Xeyo |
|-------|:---:|:---:|:---:|------------|
| **Téléphone** | ✅ | ✅ | ✅ | Opt-in + notifs WhatsApp + SAV |
| **Nom** | ✅ | ✅ | ✅ | Personnaliser les messages + SAV |
| **Email** | ✅ | ✅ | ✅ | Notif email (canal alt.) + SAV email |
| **Adresse** | ✅ | ✅ | ⬜ | Suivi livraison + questions SAV |

⚠️ Boutique de DEV : pas de soumission à review nécessaire — sélectionner
l'usage suffit (accès immédiat). La review n'est requise que pour l'App Store.
Après activation : RÉINSTALLER l'app pour appliquer les nouvelles permissions.

### Engagements de conformité (à cocher)
- Données chiffrées au repos et en transit (AES-256-GCM côté app, HTTPS).
- Conservation limitée + suppression sur demande (webhooks RGPD ci-dessous).
- Pas de revente des données.

---

## 3. Webhooks RGPD obligatoires (mandatory compliance webhooks)

Shopify EXIGE ces 3 webhooks pour toute app accédant aux données client.
Routes déjà implémentées :

| Topic | Route |
|-------|-------|
| `customers/data_request` | `/api/shopify/webhooks/customers-data-request` |
| `customers/redact` | `/api/shopify/webhooks/customers-redact` |
| `shop/redact` | `/api/shopify/webhooks/shop-redact` |

À déclarer dans le Dashboard (ou le toml) avec l'URL `https://app.xeyo.io/...`.
⚠️ VÉRIFIER qu'ils sont bien déclarés + qu'ils répondent 200 + valident l'HMAC.

---

## 4. App Proxy (déjà configuré)

Permet à la vitrine d'appeler Xeyo. Déclaré dans le toml :
```
[app_proxy]
url = "https://app.xeyo.io/api/shopify/proxy"
subpath = "xeyo"
prefix = "apps"
```
Routes : `/apps/xeyo/widget` (bulle), `/apps/xeyo/optin` (opt-in), `/apps/xeyo/order-phone`.

---

## 5. Extensions déployées (Theme + Checkout UI)

| Extension | Type | Cible |
|-----------|------|-------|
| `xeyo-widget` | Theme App Extension | Bulle WhatsApp flottante + opt-in page produit |
| `xeyo-thankyou-optin` | Checkout UI Extension | Opt-in WhatsApp sur la page de remerciement |

Déploiement : `shopify app deploy` (CLI).

---

## 5.bis Network access (Checkout UI Extension) — ÉTAPE OBLIGATOIRE

Les Checkout UI Extensions qui font des `fetch()` (notre opt-in + pré-remplissage)
ont besoin de `network_access = true` dans `extensions/xeyo-thankyou-optin/shopify.extension.toml`.

⚠️ **Sans approbation, la version ne se PUBLIE pas** ("L'accès au réseau doit être
demandé et approuvé"). Les versions créées restent inactives.

### Où l'autoriser (auto-approuvé instantanément)
**Partner Dashboard → app Xeyo → Demandes d'accès à l'API →**
section **"Autoriser l'accès réseau dans les extensions d'IU de paiement et de comptes"**
→ bouton **"Autoriser l'accès au réseau"**.
→ Approuvé immédiatement. Puis `shopify app deploy` publie la version.

⚠️ Si erreur "Could not grant... scope" : renseigner **prénom + nom** dans le
profil du compte Partner, puis réessayer.

Doc : https://shopify.dev/docs/apps/build/checkout/capabilities

## 5.ter Piège CORS sur les fetch via App Proxy

Le proxy Shopify (`{shop}/apps/xeyo/...`) répond par un **302** vers app.xeyo.io.
Un `fetch` POST avec `Content-Type: application/json` déclenche un **preflight CORS**
qui ÉCHOUE sur la redirection ("Redirect is not allowed for a preflight request").
→ **Solution** : envoyer avec `Content-Type: text/plain` (requête simple, pas de
preflight). La route serveur lit quand même le body via `req.json()`.

## 5.quater Pré-remplissage du téléphone (page Merci)

Shopify n'expose PAS le téléphone aux extensions côté client. On le récupère
côté serveur :
- `orderConfirmation.order.id` (gid OrderIdentity) → ID numérique
- l'extension appelle `/apps/xeyo/order-phone?id=...`
- l'endpoint interroge l'Admin API (`order(id:)` → shippingAddress.phone)
- nécessite **Protected Customer Data approuvé** + scope `read_orders` + **app
  (ré)installée** après l'approbation (nouveau token).

---

## 6. Checklist de publication / review

### Avant de soumettre
- [x] **Protected Customer Data** approuvé (section 2) — fait pour xeyo-dev
- [x] **Network access** (Checkout UI) autorisé (section 5.bis) — fait
- [ ] **3 webhooks RGPD** déclarés et fonctionnels (section 3)
- [ ] **Pages légales** accessibles publiquement :
  - https://app.xeyo.io/privacy (politique de confidentialité)
  - https://app.xeyo.io/cgu, /cgv, /legal, /data-deletion
- [ ] **Listing App Store** : nom, description, captures, icône (1200×1200), catégorie
- [ ] **App testée** sur une boutique de dev de bout en bout
- [ ] **Facturation** : si App Store public, la **Billing API Shopify** est OBLIGATOIRE
      (on ne peut pas facturer via Stripe en redirection pour une app publique).
      → Pour distribution privée/dev, Stripe en redirection est OK.

### Distribution
- **Distribution personnalisée** (recommandé pour démarrer) : liens d'install par
  boutique, pas de review App Store, Stripe OK.
- **Distribution publique** (App Store) : review Shopify complète + Billing API obligatoire.

### Points de review fréquents
- L'app doit s'installer/désinstaller proprement.
- Respect des Protected Customer Data (justifié + minimal).
- Webhooks RGPD répondent.
- Pas de scope demandé sans usage réel.
- Performance de l'interface admin (Web Vitals) — page embarquée /shopify.

---

## 7. État actuel (au 2026-06-11)

- ✅ App installable (distribution dev), embedded page /shopify avec onboarding
- ✅ OAuth + App Proxy + extensions déployées
- ✅ Webhooks RGPD : routes existantes (à RE-VÉRIFIER déclarées dans Dashboard)
- ✅ Pages légales en ligne (FR/EN)
- ✅ Opt-in conforme Meta/RGPD (consentement explicite, marketing, STOP, filtre campagnes)
- ✅ **Protected Customer Data approuvé** (téléphone/nom/email/adresse) sur xeyo-dev
- ✅ **Network access (Checkout UI) autorisé** → opt-in + pré-remplissage fonctionnent
- ✅ **Pré-remplissage du numéro** sur la page Merci (via order-phone + Admin API)
- ✅ Fix CORS (text/plain) pour le POST opt-in via proxy
- ⏳ Billing API Shopify : NON faite (requise seulement pour l'App Store public)

### IMPORTANT — à refaire pour CHAQUE nouvelle boutique cliente / la prod
1. Protected Customer Data : à demander par app, pas par boutique (déjà fait au
   niveau de l'app). Pour la prod App Store → soumettre à review.
2. Network access (Checkout UI) : déjà au niveau de l'app (fait).
3. Réinstaller l'app après ces approbations (nouveau token avec les accès).
4. Déclarer les 3 webhooks RGPD.
5. (App Store) Billing API + listing + review.

### Prochaine action immédiate
Finaliser la demande **Protected Customer Data** (Service client + Fonctionnalité
de l'app + Marketing). Une fois approuvée → le pré-remplissage du numéro sur la
page Merci fonctionnera (endpoint /apps/xeyo/order-phone).
