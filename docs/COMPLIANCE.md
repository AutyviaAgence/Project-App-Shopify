# Conformité & Validations (Meta / Google / Shopify)

> Checklist de référence pour passer les validations nécessaires au lancement.
> Sources officielles citées en bas. Mis à jour : juin 2026.

---

## Vue d'ensemble — les 3 piliers communs

Les 4 validations (Meta Tech Provider, Meta App Review, Google OAuth, Shopify
App Store) reposent en grande partie sur les **mêmes** fondations :

1. **Politique de confidentialité publique** — détaillée, accessible, sur le domaine.
2. **Landing page crédible** — décrit le service, lien privacy en page d'accueil.
3. **Conformité données** — suppression de compte, webhooks RGPD, chiffrement,
   scopes/données minimaux.

> 💡 Construire ces 3 piliers proprement une fois = couvre l'essentiel des 4 validations.

---

## A. LANDING PAGE (domaine public — ex. autyvia.fr)

Obligatoire pour TOUTES les validations :

- [ ] **Politique de confidentialité** liée **en page d'accueil**
      (Google exige : lien sur le homepage ET identique à l'écran de consentement
      OAuth, hébergé sur le même domaine).
- [ ] **Conditions d'utilisation (CGU/CGV)**.
- [ ] **Mentions légales** : raison sociale, SIREN/SIRET, adresse, contact.
- [ ] **Description claire du service** (Meta/Google vérifient la crédibilité).
- [ ] **Email de contact pro** sur le domaine (ex. contact@autyvia.fr).
- [ ] HTTPS partout (✅ déjà en place).

### Contenu de la Politique de confidentialité (doit couvrir)

- Quelles données sont collectées :
  - Messages WhatsApp (contenu, numéros) — via Meta WABA
  - Données Google (si Gmail/Calendar conservés)
  - Données client Shopify (commandes, produits, contacts)
  - Données de compte (email, profil)
- Comment elles sont **stockées** (Supabase self-hosted, chiffrement des messages
  via MESSAGE_ENCRYPTION_KEY ✅), **utilisées** (réponses IA, RAG), **partagées**
  (OpenAI pour l'IA, Meta/Shopify pour l'envoi).
- **Durée de conservation** + **droit à la suppression** (lien/endpoint).

---

## B. META — Tech Provider & App Review (WhatsApp)

> Nécessaire UNIQUEMENT pour l'Embedded Signup (clients connectent leur numéro
> en 1 clic). PAS nécessaire pour le mode manuel actuel.

- [ ] **Business Verification** chez Meta (SIREN/SIRET — micro-entreprise acceptée).
- [ ] App Meta avec produits **WhatsApp** + **Facebook Login for Business**.
- [ ] Permissions à demander : `whatsapp_business_messaging` + `whatsapp_business_management`.
- [ ] **App doit savoir CRÉER et ENVOYER des templates** (prérequis filmé).
- [ ] **2 vidéos** :
  1. Créer un message → l'envoyer depuis l'app → le recevoir sur WhatsApp.
  2. Créer un **template** de message dans l'app.
- [ ] **Privacy Policy URL** + **Data Deletion URL** (endpoint de suppression —
      `/api/account/delete` existe déjà, à exposer publiquement).
- [ ] Webhook WABA sécurisé (signature `X-Hub-Signature-256` ✅ déjà fait).

État app actuel : `sendTemplate()` existe dans `lib/whatsapp-cloud/client.ts`.
Manque : **UI de gestion des templates** (créer / soumettre à Meta / suivre le statut).

---

## C. GOOGLE OAuth

> ⚠️ Si l'Email/Gmail est RETIRÉ (décision refonte), la vérification OAuth
> **sensible** Gmail n'est PLUS nécessaire → grosse contrainte en moins.
> Ne garder Google que si Calendar/Sheets (tools agents) sont conservés.

Si Google conservé :
- [ ] **Scopes minimaux** (Google refuse les scopes trop larges ; ne JAMAIS demander
      l'accès Gmail complet si on envoie juste des emails).
- [ ] Privacy policy sur le homepage = identique à l'écran de consentement OAuth.
- [ ] Écran de consentement configuré (logo, domaine vérifié).
- [ ] Pour scopes sensibles : justification détaillée + **vidéo démo** (review 3-5 j).

---

## D. SHOPIFY — App Store

- [ ] **Privacy policy** liée depuis le listing App Store.
- [ ] **3 webhooks de conformité RGPD OBLIGATOIRES** (à implémenter + vérifier
      AVANT soumission, même sans collecte de données perso) :
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`
- [ ] HTTPS sur tous les endpoints webhook (✅).
- [ ] **Protected Customer Data** (depuis août 2025) : minimiser la collecte,
      chiffrer/masquer les données sensibles, tenir un registre de traitement.
- [ ] L'app fait réellement ce que décrit le listing.
- [ ] Respect du Partner Program Agreement + Acceptable Use Policy.

État app actuel : Shopify est un **outil d'agent** (search_product, order_status…),
pas encore une app publique sur l'App Store. Pour publier : créer l'app publique
Shopify + les webhooks RGPD ci-dessus.

---

## Logique IA vs Templates (architecture WhatsApp)

Règle Meta de la **fenêtre 24h** :

```
Client écrit → fenêtre 24h ouverte → 🤖 IA répond librement
Silence > 24h → fenêtre fermée → 📋 TEMPLATE obligatoire pour rouvrir
Client répond au template → fenêtre rouverte → 🤖 IA reprend la main
```

- L'IA est le **cœur conversationnel** (90% des échanges, dans la fenêtre 24h).
- Les **templates** servent à (r)ouvrir une conversation hors fenêtre :
  relances, notifs commande, campagnes (contact initié par le marchand).
- À construire : **logique de bascule** automatique fenêtre ouverte/fermée
  (basée sur `conversations.last_message_at` / dernier message entrant < 24h).

---

## Ce que la refonte doit prévoir (impact structurel)

- [ ] **Gestion des templates** (UI création + soumission Meta + statut) — utile
      tout de suite (relances/campagnes) ET prérequis App Review.
- [ ] **Bascule IA/template** selon la fenêtre 24h.
- [ ] **Endpoint de suppression de compte** exposé publiquement (Meta Data Deletion).
- [ ] **Webhooks RGPD Shopify** (3) si publication App Store.
- [ ] **Pages légales** : privacy, CGU, mentions légales (existent en partie —
      `(legal)/cgu`, à compléter avec privacy + mentions).
- [ ] Décider du sort de **Google/Gmail** (retrait = pas de vérif OAuth sensible).

---

## Sources

- Google — Sensitive scope verification :
  https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Google — OAuth App Verification :
  https://support.google.com/cloud/answer/13463073
- Meta — Become a Tech Provider :
  https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Meta — App Review sample submission :
  https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission
- Shopify — Privacy law compliance :
  https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- Shopify — Protected customer data :
  https://shopify.dev/docs/apps/launch/protected-customer-data
