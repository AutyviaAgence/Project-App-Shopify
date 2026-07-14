# Xeyo — Conformité & App Review Shopify

> **Document de référence unique** pour la soumission de l'app au Shopify App Store.
> Remplace `plan-conformite-app-review-shopify.md` (plan exécuté) et fait autorité
> sur `SHOPIFY_APP_REVIEW.md` (scopes périmés) en cas de contradiction.
>
> Dernière vérification contre le code : **13 juillet 2026** (commit `e9617dd`).
> État : **conforme, en attente de déploiement VPS + 2 champs Partner Dashboard.**

Référentiel officiel : <https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements>

---

## ⚠️ Il y a DEUX apps Shopify — ne pas les confondre

| App | Client ID | Config | Distribution | Usage |
|---|---|---|---|---|
| **Xeyo - WhatsApp Support & Chat** | `f9d37d1f9ab1427165874c33eb7c4926` | `shopify.app.xeyo-app-store.toml` | **Shopify App Store** (publique) | 🎯 **Celle qui sera distribuée aux marchands.** |
| Xeyo - Testing app custom | `7510fef84b3b8bd4440344e9f6b626d4` | `shopify.app.xeyo-testing-custom.toml` | Distribution personnalisée | Dev/test sur `xeyo-dev.myshopify.com` uniquement. |

**Pourquoi deux ?** La première app avait été créée en **« distribution
personnalisée »**. Ce choix est **irréversible** : Shopify ne permet aucune
conversion vers une app publique, *même par le support* (« This isn't possible.
You need to create a new app and select public distribution. »). Or la custom
distribution ne peut être installée que sur **une seule boutique** (ou les
boutiques d'une même organisation Plus) et **ne peut pas utiliser la Billing
API** — donc impossible de vendre à des marchands extérieurs. D'où la création
d'une seconde app, publique, dès le départ.

> 🪤 **Le piège à connaître** : `shopify app config link` **écrase le `.toml`
> existant** (scopes vidés, `application_url` remis à `example.com`, webhooks et
> App Proxy supprimés). Commite toujours avant de lier une app.

Toute la suite de ce document décrit **l'app publique** (`xeyo-app-store`).
Commandes : ajouter `--config xeyo-app-store`.

---

## 0. Ce qui reste à faire avant de soumettre

Le code est déployé en prod et conforme (vérifié : les routes répondent `401`, pas
`404`). Ce qui reste tient à la **bascule vers la nouvelle app publique**, puis à
la fiche App Store.

### Bascule vers l'app publique

| # | Action | Détail |
|---|--------|--------|
| 1 | `shopify app deploy --config xeyo-app-store` | Publie scopes, webhooks RGPD, App Proxy sur la nouvelle app. |
| 2 | **Variables d'env du VPS** | `SHOPIFY_API_KEY` → `f9d37d1f9ab1427165874c33eb7c4926` **et le nouveau `SHOPIFY_API_SECRET`**. ⚠️ Le secret est propre à chaque app : sans lui, **toutes** les vérifications HMAC échouent (session tokens, webhooks, App Proxy). |
| 3 | Redéployer le VPS | Pour que les nouvelles variables soient prises en compte. |
| 4 | Réinstaller l'app sur la boutique de test | L'ancienne installation pointe sur l'ancien `client_id`. |

### Fiche App Store (Partner Dashboard, à la main)

Ces deux champs **ne peuvent pas vivre dans le `.toml`** — la CLI rejette
`privacy_policy_url` (« Unsupported section ») :

- **URL de politique de confidentialité** → `https://app.xeyo.io/privacy` (en ligne, vérifiée).
- **Contact support** (email/URL).

Ils n'apparaissent qu'**après** avoir choisi la distribution « Shopify App Store »
sur l'app : sans ce choix, il n'y a pas de fiche à remplir. Ils ne sont ni sur
l'écran « Création de version », ni dans « Paramètres » du dev dashboard.

> L'inscription App Store coûte **19 $ une fois** (pas par app) et ouvre les
> « applications publiques illimitées ».

---

## 1. La règle qui tue : facturation Shopify obligatoire

**On ne peut pas facturer les marchands via Stripe.** C'est l'exigence **1.2.1**, et
elle n'a pas d'échappatoire pour nous :

- Elle s'applique aussi aux apps **non listées (unlisted)** — l'« unlisted » ne
  contourne rien.
- La **seule** exception réelle est l'app *custom* (installée sur une boutique
  unique, hors App Store) — ce n'est pas notre modèle.
- Sanction constatée : suspension de l'app sous ~10 jours.

Commission Shopify : **0 % sur le premier million de dollars** de revenus cumulés,
puis 15 %. Ce n'est donc pas un coût au lancement.

### Comment c'est appliqué dans le code

L'aiguillage se fait sur `shopify_stores.billing_source` :

- à l'installation, la boutique est créée avec `billing_source = 'shopify'`
  (`src/lib/shopify/resolve-user.ts`) ;
- les **6** routes Stripe refusent (403) tout marchand facturé par Shopify, via le
  garde `isShopifyBilled(user.id)` :
  `create-checkout`, `change-plan`, `buy-ai-credits`, `buy-tokens`, `portal`,
  `cancel-subscription`.

> ⚠️ **Piège historique, à ne pas réintroduire.** Le bug d'origine était *circulaire* :
> l'install posait `billing_source: 'direct'`, donc le test `=== 'shopify'` n'était
> jamais vrai, donc **100 % des marchands partaient sur Stripe**. Si tu touches au
> flux d'installation, revérifie cette valeur — le symptôme est silencieux.

Stripe reste légitime pour les inscriptions **hors Shopify** (site direct). Les deux
mondes coexistent ; `billing_source` est la frontière.

---

## 2. Webhooks de conformité RGPD — syntaxe canonique

**Enregistrés et confirmés côté Shopify.** Les trois routes existent et vérifient le HMAC.

| Topic | Route |
|---|---|
| `customers/data_request` | `src/app/api/shopify/webhooks/customers-data-request/route.ts` |
| `customers/redact` | `src/app/api/shopify/webhooks/customers-redact/route.ts` |
| `shop/redact` | `src/app/api/shopify/webhooks/shop-redact/route.ts` |

### La syntaxe (deux journées perdues là-dessus — à lire avant de modifier)

Ce sont des `compliance_topics` dans un `[[webhooks.subscriptions]]` **normal** :

```toml
[[webhooks.subscriptions]]
uri = "https://app.xeyo.io/api/shopify/webhooks/customers-redact"
compliance_topics = [ "customers/redact" ]
```

Ce qui **ne marche pas** :

- `topics = [ "customers/redact" ]` → le serveur répond
  *« The following topic is invalid: customers/redact »*.
- une section `[webhooks.privacy_compliance]` avec `customer_deletion_url = …` →
  acceptée en entrée mais ce n'est pas la forme canonique.

> 🪤 **`shopify app config validate` passe avec la mauvaise syntaxe.** Seul le
> serveur, au `deploy`, la rejette. Ne te fie pas au validate. Pour connaître la
> vérité de ce qui est enregistré : `shopify app config pull`.

Ces webhooks **ne se configurent pas** sur l'écran « Création de version » du Partner
Dashboard — ne les y cherche pas.

---

## 3. Sécurité — le bug qui justifiait tout le chantier

`customers/redact` supprimait les contacts **par téléphone/email, sans filtre de
boutique**. Un effacement demandé par la boutique A détruisait les contacts de
**tous les marchands** ayant ce numéro. Destruction cross-tenant + incident RGPD.

Corrigé : la suppression est scopée
`shop_domain → shopify_stores.user_id → whatsapp_sessions.id → contacts.session_id`.

**Invariant à préserver** : toute route Shopify qui écrit ou supprime doit passer par
le `user_id` de la boutique. En embedded il n'y a **pas de RLS** (on utilise la
service-role key) — chaque filtre `user_id` est donc explicite et manuel. Si tu
ajoutes une route embedded, ce filtre est ta seule protection.

---

## 4. Auth embedded — pourquoi l'auto-provisioning

Le blocage architectural : un **session token Shopify identifie une boutique, jamais
un compte Xeyo**. Ses claims sont `dest` (le shop), `aud` (le client_id) et `sub`
(l'ID d'un membre du staff Shopify — sans rapport avec un compte Xeyo). Pour un
marchand qui installe l'app depuis l'App Store, `shopify_stores.user_id` est `NULL`.

D'où le choix retenu : **créer le compte Xeyo automatiquement** à la première visite.

- `src/lib/shopify/session-token.ts` — vérification JWT : signature HS256
  (`timingSafeEqual`), `aud === SHOPIFY_API_KEY`, `exp`/`nbf`, extraction du shop
  depuis `dest`. Testé contre jeton forgé / mauvais `aud` / expiré / domaine
  malveillant → tous rejetés.
- `src/lib/shopify/resolve-user.ts` — résolution en 3 temps :
  1. `store.user_id` existe → on le renvoie ;
  2. un profil a le même email que la boutique → on l'y rattache (pas de doublon) ;
  3. sinon → création du compte (`email_confirm: true`), puis `billing_source = 'shopify'`
     et configuration auto de l'agent.
- `src/lib/shopify/embedded-auth.ts` — `getAuthedUser(req)` : session token, sinon
  repli sur le cookie (parcours web classique).

**Interdit** : réintroduire un `window.top.location` pour sortir de l'iframe, ou un
écran « Connectez-vous / Créez un compte » dans l'app embedded. C'est un rejet
immédiat (exigence 2.2.2 : expérience embarquée cohérente).

---

## 5. GraphQL obligatoire

L'exigence **2.2.4** rend l'**Admin API GraphQL obligatoire** : tout appel REST Admin
API = rejet. Vérifié : **il ne reste aucun appel REST Admin dans le code.**

- `src/lib/shopify/client.ts` — `fetchOrderById` et `listAllOrders` migrés en GraphQL.
  Un mapper `gqlOrderToRest()` reconvertit la réponse en `snake_case` pour ne rien
  casser en aval : **le reste du code continue de consommer la forme REST**. Ne
  « nettoie » pas ce mapper sans reprendre tous les appelants.
- `src/lib/tools/executor.ts` — l'outil IA `executeShopify()` (REST Admin 2024-01)
  a été **supprimé** (0 utilisateur en base).

> Si tu ajoutes un appel Shopify : **GraphQL, sans exception.** Un seul `fetch` vers
> `/admin/api/…` suffit à faire rejeter la soumission.

---

## 6. Le reste des exigences

| Exigence | Statut | Où |
|---|---|---|
| **1.1.1** Session tokens | ✅ | `session-token.ts`, `authenticated-fetch.ts` (client) |
| **1.2.1** Facturation Shopify | ✅ | §1 |
| **1.2.3** Changement de plan self-serve | ✅ | sélecteur de plan + `api/shopify/billing/cancel` (annulation) |
| **2.2.2** Expérience embarquée | ✅ | App Bridge v4 via CDN (`src/app/shopify/layout.tsx`), pas d'échappée d'iframe |
| **2.2.4** GraphQL Admin API | ✅ | §5 |
| **5.1.2** Widget visible dans l'éditeur de thème | ✅ | `whatsapp-bubble.liquid` : rendu en aperçu sous `Shopify.designMode` même sans WhatsApp connecté, liens neutralisés |
| **5.1.5** Données client dans l'admin | ✅ | `api/shopify/embedded/overview` : contacts, opt-ins, 10 conversations récentes |
| **RGPD** webhooks | ✅ | §2 |

### Scopes demandés

```
read_content, read_customers, read_fulfillments, read_legal_policies,
read_orders, read_products, read_returns, write_discounts, write_orders
```

`read_discounts` a été **retiré** : on ne fait que *créer* des remises, d'où
`write_discounts` seul.

> ⚠️ Le `.toml` fait foi, **pas** la variable `SHOPIFY_SCOPES`. Ajouter un scope
> impose : `shopify app deploy --config …` + **réinstallation** de l'app sur la
> boutique + `reregister-webhooks`. Sans ça, les appels concernés tombent en 403.

`read_returns` demandera une justification écrite au moment de la soumission
(Protected Customer Data).

---

## 7. Protected Customer Data — ce qui a été déclaré

Formulaire du Partner Dashboard (obligatoire dès `read_customers` / `read_orders`).
Shopify **vérifie que l'usage déclaré correspond au comportement réel de l'app** :
sur-déclarer nuit autant que sous-déclarer.

**Motifs d'usage** : Service client · Fonctionnalité de l'app · Analyses de données ·
Personnalisation · **Marketing ou publicité** (obligatoire : la relance de panier
abandonné est l'exemple que Shopify donne lui-même, et c'est notre fonction phare).
Pas « Gestion de la boutique » (on n'imprime pas d'étiquettes, on ne suit pas de stock).

**Champs demandés** :

| Champ | Motifs déclarés | Pourquoi |
|---|---|---|
| **Téléphone** | tous | C'est l'identifiant WhatsApp : sans lui, l'app ne fait rien. |
| **Nom** | Service client, Personnalisation, Marketing | Personnalisation des templates + affichage dans l'inbox. |
| **E-mail** | Service client, Fonctionnalité | Jointure client Shopify ↔ contact WhatsApp, et clé des webhooks RGPD. |
| **Adresse** | **non demandé** | On ne lit que `phone` et `countryCodeV2` des adresses — jamais la rue ni la ville. Demander un champ inutilisé est sanctionné. |

**Protection des données** — réponses honnêtes, y compris les manques :

| Question | Réponse | Justification |
|---|---|---|
| Chiffrement au repos et en transit | Oui | AES-256-GCM sur les messages, TLS partout. |
| Durées de rétention configurées | **Oui** *(depuis juill. 2026)* | Voir §8. Avant ça : Non. |
| Politique de réponse aux incidents | Oui | [`SECURITY_INCIDENT_POLICY.md`](SECURITY_INCIDENT_POLICY.md). |
| Décision automatisée à effet juridique | Sans objet | L'IA répond à des questions ; aucune décision au sens de l'art. 22. |
| Chiffrement des sauvegardes | **Oui** | AES-256 + PBKDF2 — voir [`RGPD.md §5`](RGPD.md). |
| Journal d'audit des accès | **Oui** | Table `data_access_log` — voir [`RGPD.md §4`](RGPD.md). |

---

## 8. Rétention des données (RGPD art. 5.1.e)

À ne pas confondre avec le **droit à l'effacement** (art. 17, couvert par
`customers/redact`, sur demande) : la rétention impose de **ne pas conserver**
les données au-delà du nécessaire, **automatiquement**.

- Réglage : `/admin` → Paramètres généraux → **Conservation des données**
  (`platform_settings.message_retention_days` / `log_retention_days`).
- Purge : `GET /api/cron/run-retention` (Bearer `CRON_SECRET`), par lots de 1000.
- Défauts : **730 j** pour les messages, **90 j** pour les `webhook_logs`.
  `0` = illimité (purge désactivée) — c'est le repli, pour qu'aucun déploiement
  n'efface de données sans décision explicite.

> ⚠️ **Les contacts ne sont jamais purgés.** Supprimer un contact opt-in
> détruirait son consentement WhatsApp et le sortirait des automatisations : ce
> serait une régression fonctionnelle déguisée en conformité. On purge
> l'historique des échanges, pas la relation commerciale.

**Verrou 24 h.** La route est branchée sur l'ordonnanceur qui tourne **chaque
minute** (le même que les autres jobs). Elle se verrouille donc elle-même via
`retention_last_run_at` : un seul passage effectif par jour, les 1439 autres
appels ressortent immédiatement sans toucher à la base. Sans ce garde, on
scannerait `messages` et `webhook_logs` 1440 fois par jour pour rien.

Un échec **ne réarme pas** le verrou : le tick suivant (1 min) réessaie, plutôt
que d'attendre 24 h en laissant l'erreur passer inaperçue.

---

## 9. Pièges Shopify vécus (à ne pas repayer)

**L'App Proxy est FIGÉ à l'installation.** `subpath` et `prefix` ne s'appliquent
qu'aux **nouvelles installations** : modifier le `.toml` puis `shopify app deploy`
**ne suffit pas**. Sur une boutique déjà installée, Shopify continue de renvoyer
**404** sur `/apps/xeyo/*` — alors que le backend répond parfaitement en direct.
➜ **Désinstaller et réinstaller l'app** sur chaque boutique. Il n'y a pas d'autre moyen.
*(Symptôme vécu : la bulle WhatsApp ne s'affichait jamais, son fetch tombait en 404.)*

**App Bridge s'aborte s'il n'est pas le PREMIER `<script>` du `<head>`**, ou s'il
porte `async`/`defer`. `<Script strategy="beforeInteractive">` de next/script ajoute
`async` → App Bridge refusait de démarrer, `window.shopify` n'existait jamais, aucune
requête ne portait de session token, et l'app affichait « Installation requise ».
➜ Le tag est écrit **en dur dans le root layout**. Ne pas le déplacer.

**Les jetons non-expirants sont REFUSÉS** (403) depuis déc. 2025. Le token exchange
doit passer `expiring: "1"`, et les jetons se rafraîchissent via `refresh_token`.
➜ Tout accès à l'Admin API passe par `getValidAccessToken()` — lire `access_token`
en base donne tôt ou tard un **403 silencieux** (crons, webhooks, relances compris).

**Le managed install n'appelle JAMAIS le callback OAuth.** La boutique doit être
provisionnée par **token exchange** à la première ouverture embedded
(`ensure-store.ts`), sinon elle n'existe nulle part et l'app affiche
« Installation requise » indéfiniment.

**`shopify app config link` ÉCRASE le `.toml`** (scopes vidés, `application_url`
remis à `example.com`, webhooks et App Proxy supprimés). Commiter avant de lier.

**`read_shop` n'existe pas.** Les infos de boutique (`shop { name email }`) ne
demandent aucun scope.

---

## 9. Dette connue (non bloquante pour la review)

Par ordre de ce que je corrigerais en premier :

1. **Fuite d'information sur le proxy widget.** `src/app/api/shopify/proxy/widget/route.ts`
   ne vérifie la signature App Proxy **que si elle est présente** (`if (signature)`).
   Une requête sans paramètre `signature`, avec un simple `?shop=<boutique>`, passe
   donc sans contrôle et révèle le numéro WhatsApp du marchand. Le correctif est de
   rendre la signature obligatoire — à valider contre le rendu storefront réel, car
   c'est ce chemin qui sert la bulle.
2. **`APP_SUBSCRIPTIONS_UPDATE` non abonné.** Un changement de plan (ou une
   annulation) initié côté Shopify n'est pas répercuté dans notre base.
3. **PostHog** absent de l'onboarding et des nouvelles pages d'automatisations
   (explicitement reporté).

> Le chiffrement des backups et le journal d'audit, longtemps en dette, sont
> **faits** — voir [`RGPD.md`](RGPD.md). ⚠️ Le premier exige une **passphrase posée
> sur le VPS**, sans quoi le script de backup s'arrête et il n'y a plus aucune
> sauvegarde.

---

## 8. Aide-mémoire commandes

```powershell
# Vérité de ce qui est enregistré chez Shopify (écrase le .toml local !)
shopify app config pull --config xeyo-whatsapp-support-chat

# Publier scopes / webhooks / URLs
shopify app deploy --config xeyo-whatsapp-support-chat

# ⚠️ `shopify app config validate` NE détecte PAS les erreurs de webhooks.
```

Après un changement de scopes : réinstaller l'app sur la boutique, puis appeler
`/api/shopify/reregister-webhooks`.
