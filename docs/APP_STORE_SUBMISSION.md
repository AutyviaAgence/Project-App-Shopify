# Soumission App Store — checklist bloquante

**À relire intégralement le jour de la soumission.** Chaque ligne cochée « ⬜ » est une
action à faire *avant* d'envoyer l'app en review. Certaines ne cassent rien en dev mais
provoquent un rejet, ou pire : une facturation qui ne facture personne.

App publique : **Xeyo — WhatsApp Support & Chat**
Client ID `f9d37d1f9ab1427165874c33eb7c4926` · config `shopify.app.xeyo-app-store.toml`

Dernier audit : 14 juill. 2026 (plugin officiel `shopify-app-store-review`).
Résultat : 27 exigences conformes, 1 corrigée, 3 à trancher (ci-dessous).

---

## 🔴 BLOQUANT — à faire avant de soumettre

### ⬜ 1. Retirer `SHOPIFY_BILLING_TEST` de la production

**Le piège :** si cette variable vaut `true` en prod, tous les abonnements sont créés
avec `test: true` — **aucun marchand n'est réellement débité**. L'app tourne, les plans
s'activent, et pourtant zéro euro n'entre.

Le défaut est sûr (sans la variable, la vraie facturation s'applique), mais elle a été
posée pour les tests et doit sauter.

```bash
# Dokploy → variables d'environnement : SUPPRIMER la ligne SHOPIFY_BILLING_TEST
# Vérification dans le code : src/app/api/shopify/billing/subscribe/route.ts
#   const isProd = NODE_ENV === 'production' && SHOPIFY_BILLING_TEST !== 'true'
#   → createAppSubscription({ test: !isProd })
```

### ⬜ 2. CRÉER `NEXT_PUBLIC_SHOPIFY_APP_STORE_URL` (elle n'existe pas encore — c'est normal)

**Cette variable n'est pas censée exister aujourd'hui.** Tant que la fiche est en
brouillon, `apps.shopify.com/<handle>` renvoie un **404** : on ne peut donc pas y
pointer. Le code utilise en attendant une valeur par défaut **en dur** — le lien
d'installation du Dev Dashboard (`src/lib/shopify/app-store.ts:23`).

Le jour où la fiche est **publiée**, il faut la créer dans Dokploy :

```bash
NEXT_PUBLIC_SHOPIFY_APP_STORE_URL=https://apps.shopify.com/<handle>
```

⚠️ **`NEXT_PUBLIC_*` est inliné AU BUILD.** Ajouter la variable dans Dokploy sans
**reconstruire l'image** ne change strictement rien : l'ancienne valeur reste compilée
dans le bundle. Il faut redéployer après l'avoir posée.

Sans ça, tous les boutons « Installer Xeyo depuis Shopify » (onboarding, login,
register, dashboard) continueront d'envoyer les marchands sur le Dev Dashboard au lieu
de ta fiche publique.

### ⬜ 3. Régénérer `CRON_SECRET`

Il a circulé en clair pendant le développement.

---

## 🟠 À TRANCHER — décisions, pas des bugs

### ⬜ 4. Renvoyer les numéros collectés dans Shopify ? (exigence 5.1.5)

**État actuel :** les numéros WhatsApp collectés (popup, checkout, page Merci) vivent
uniquement dans notre base. Le marchand les voit dans le dashboard Xeyo (liste des
contacts, recherche, tri, **export CSV**).

L'exigence 5.1.5 est satisfaite par la voie « in-app dashboard » — c'est explicitement
prévu : *« customer data is either written back to Shopify Admin **or** displayed in an
in-app dashboard component »*.

**Le risque :** un reviewer strict peut exiger un write-back dans l'Admin Shopify (tag
client ou metafield). Cela demanderait le scope `write_customers`, absent aujourd'hui.

→ Soumettre tel quel, et n'ajouter le write-back que si Shopify le réclame.

### ⬜ 5. Vérifier le certificat TLS de `app.xeyo.io` (exigence 3.1.1)

Non vérifiable depuis le code. Passer l'URL sur **SSL Labs** et viser au moins un A.
HSTS est déjà envoyé (`next.config.ts:64`).

### ⬜ 6. Deep link vers l'éditeur : pré-sélectionner le bloc (5.1.3 — confort)

Le deep link existe (`src/app/onboarding/page.tsx:790`) et l'onboarding montre une
démo animée du geste. On pourrait ajouter `&activateAppId=<uuid>/xeyo-widget` pour que
le bloc soit **pré-activé** au lieu que le marchand le cherche.

Non bloquant, mais c'est un point de friction en moins sur l'étape la plus ratée.

---

## 📦 Fiche App Store (Partner Dashboard)

- ⬜ **URL de politique de confidentialité** : `https://app.xeyo.io/privacy`
- ⬜ **Contact support** (email + délai de réponse annoncé)
- ⬜ **Captures d'écran** de l'app
- ⬜ **Compte de test** pour le reviewer, **avec un WhatsApp déjà connecté** — sans ça,
  la bulle et la popup ne s'affichent pas sur la boutique (le proxy renvoie
  `enabled: false`) et le reviewer conclura que l'app ne marche pas.
- ⬜ **Screencast** (3–8 min) : installation → onboarding → agent qui répond sur WhatsApp

---

## ⚠️ Pièges déjà rencontrés — ne pas les refaire

### Ne JAMAIS inventer un scope

`read_shop` a été ajouté « par logique » → `These scopes are invalid`.
`write_checkout_extensions_apis` a failli l'être aussi (un audit le réclamait) : c'est
**faux**. `api_access = true` donne accès à la Storefront API et *Shopify gère lui-même
l'authentification* — aucun scope à déclarer. Ce scope est **privilégié**, il se demande
via le Partner Dashboard (Access requests), et l'écrire à la main casse le `deploy`.

**Règle : vérifier dans la doc Shopify avant d'ajouter le moindre scope.**

### Le `.toml` fait foi, pas `SHOPIFY_SCOPES`

Après tout changement de scope :
```bash
npx shopify app deploy --config xeyo-app-store   # obligatoire
# puis RÉINSTALLER l'app sur la boutique, sinon les nouveaux scopes ne sont pas accordés
```

### `shopify app config link` écrase le `.toml`

Il vide les scopes et remet `application_url` sur `example.com`. Si tu le lances,
**relis le diff git** avant de déployer.

### L'App Proxy est figé à l'installation

`subpath` / `prefix` ne peuvent pas être changés à chaud : il faut désinstaller puis
réinstaller l'app, sinon le proxy renvoie 404.

---

## ✅ Déjà conforme (vérifié le 14 juill. 2026)

- **Billing** : `appSubscriptionCreate` (Billing API). Stripe est bloqué côté serveur
  pour tout marchand `billing_source='shopify'` (garde `isShopifyBilled`, 6 routes).
  Upgrade/downgrade/annulation possibles depuis l'admin embarqué.
- **1.1.2 Checkout** : l'outil IA `create_payment_link` (lien de paiement Stripe) est
  désormais **refusé** sur une boutique Shopify — il permettait d'envoyer à un client un
  paiement hors checkout. Les outils de lecture Stripe restent permis.
- **2.2.3 App Bridge** : CDN, premier script du `<head>`, sans `async`/`defer`. Le
  package obsolète `@shopify/app-bridge` est absent.
- **2.2.4 GraphQL** : zéro appel REST Admin.
- **2.3.1** : aucun champ `.myshopify.com` accessible à un marchand (le seul existant est
  dans `/admin`, gardé par `role === 'admin'` côté serveur).
- **5.1.1** : intégration vitrine 100 % theme app extension — aucun ScriptTag, aucune
  Asset API.
- **5.6.3** : aucune auto-promotion dans les extensions checkout. Le « Powered by
  Xeyo.io » n'existe que dans la theme extension, et il est **désactivable** par le
  marchand.
- **1.1.15** : remboursements via `refundCreate`, sur le moyen de paiement d'origine
  (store credit explicitement neutralisé côté serveur).
- **3.2.1** : `read_all_orders` approuvé par Shopify, justifié par le reporting CA sur
  24 mois.
