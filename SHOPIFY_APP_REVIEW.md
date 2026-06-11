# Xeyo — Guide de review / publication de l'app Shopify

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

Déploiement : `shopify app deploy` (CLI). Network access retiré (App Proxy same-origin).

---

## 6. Checklist de publication / review

### Avant de soumettre
- [ ] **Protected Customer Data** approuvé (section 2)
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
- ⏳ **Protected Customer Data : EN COURS d'approbation** (bloque le pré-remplissage
  du téléphone côté serveur via Admin API)
- ⏳ Billing API Shopify : NON faite (requise seulement pour l'App Store public)

### Prochaine action immédiate
Finaliser la demande **Protected Customer Data** (Service client + Fonctionnalité
de l'app + Marketing). Une fois approuvée → le pré-remplissage du numéro sur la
page Merci fonctionnera (endpoint /apps/xeyo/order-phone).
