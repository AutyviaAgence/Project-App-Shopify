# Plan — Tableau de bord PERFORMANCE par campagne / automatisation (façon Meta Ads)

> Objectif : à côté du toggle « Activé » de chaque campagne/automatisation, un
> panneau/onglet **Performance** qui montre des vrais chiffres : envois,
> livrés, ouvertures, clics (dont Oui/Non par bouton), réponses, résultats A/B
> avec gagnant, conversions, et à terme le CA généré.

---

## Constat de départ (audit du code réel)

**Déjà mesuré et exploitable** (source : `ab_test_assignments` + route `ab-summary`) :
- Envois initiés, ouvertures (accusés « lu » Meta), réponses, conversions (booléen)
- Résultats A/B par variante **+ gagnant automatique**
- **Clics Oui/Non par branche** : la donnée `clicked_branch` EXISTE mais n'est
  affichée nulle part.

**Verrous techniques qui empêchent le reste** :
1. Les envois d'automatisation (`dispatch.ts`) et de campagne (`executor.ts`) **jettent
   le `wa_message_id`** renvoyé par Meta → aucun accusé livré/lu/échec ne peut être
   raccroché à ces messages. **C'est le blocage n°1.**
2. Le webhook **ignore le statut `failed`** de Meta (`waba/route.ts:185`).
3. Pas de `sent_at`/`delivered_at` sur `messages` (seul `read_at`).
4. Campagnes : `campaign_recipients.delivered_at`/`replied_at` jamais écrits →
   `delivered_count`/`replied_count` structurellement à 0.
5. Attribution conversion approximative par `contact_id`, sans montant ni fenêtre.

---

## PHASE 1 — Afficher l'existant (rapide, gros impact, ~0 risque)

**But** : une page/onglet « Performance » par campagne/auto qui expose ce qui est
DÉJÀ mesuré, sans nouvelle capture de données.

### 1.1 Backend — enrichir l'API stats existante
- **Étendre `ab-summary`** (ou nouvelle route `automations/[id]/performance`) pour
  lire aussi `clicked_branch` et agréger **les clics par bouton** :
  « Oui : 62 % · Non : 38 % » par nœud à boutons.
- Exposer par automatisation le **détail des jobs** depuis `automation_jobs`
  (envoyés / skippés / échoués / en attente de clic + raisons de skip via `result`).

### 1.2 Frontend — le panneau « Performance »
- Dans le header du builder (`workflow-builder.tsx`), à côté de « Activé » /
  « Enregistrer », un bouton **« Performance »** (icône graphe) qui ouvre un panneau.
- Contenu (cartes type Meta Ads) :
  - **Funnel** : Envoyés → Ouverts (%) → Répondus (%) → Ventes (%)
  - **A/B test** : tableau des variantes + badge « Gagnant » (déjà calculé)
  - **Boutons** : barres horizontales des clics par branche (Oui/Non/…)
  - **Jobs** : petit récap envoyés/skippés/échoués + raisons
- Sélecteur de période (7 / 30 / 90 j) — `ab-summary` gère déjà `?days=`.

**Livrable** : le commerçant voit enfin des chiffres réels par campagne, dont le
A/B et les clics de boutons. **Aucune migration lourde.**

### Limite honnête de la Phase 1
- « Ouvertures » et « conversions » restent **approximatives par contact**
  (dernier-contact, cross-automation) — à préciser dans une infobulle.
- Les **campagnes legacy** (table `campaigns`) n'ont pas encore de livré/lu fiable
  (voir Phase 2). On affiche pour elles : destinataires, envoyés, échoués.

---

## PHASE 2 — Livraison fiable (le vrai funnel Meta Ads)

**But** : Envoyé → **Livré** → **Lu** → Répondu, avec des accusés Meta rattachés au
bon message. Lève le verrou n°1.

### 2.1 Capturer le `wa_message_id` à l'envoi
- `dispatch.ts` (automatisations) : récupérer `data.id` du retour Meta (déjà
  renvoyé par `client.ts`) et l'écrire dans `messages.wa_message_id` lors de
  l'insert (`dispatch.ts:307-311`).
- `executor.ts` (campagnes) : aujourd'hui l'envoi **n'insère aucun message**.
  → Faire insérer une ligne `messages` (outbound, `wa_message_id`) à chaque envoi
  de campagne, reliée à la conversation du contact.

### 2.2 Migration `messages`
- Ajouter `sent_at TIMESTAMPTZ`, `delivered_at TIMESTAMPTZ` (on a déjà `read_at`).
- Index sur `wa_message_id` si pas déjà présent (pour le match des receipts).
- `NOTIFY pgrst, 'reload schema'` après DDL.

### 2.3 Webhook — capter livré + échec
- `waba/route.ts` : sur statut `delivered` → `delivered_at` ; sur `sent` → `sent_at`.
- **Capter le statut `failed`** (aujourd'hui ignoré ligne 185) : stocker l'échec de
  livraison (`messages.status='failed'` + raison) → vrai taux d'échec.

### 2.4 Lien message → campagne/automatisation
- Ajouter sur `messages` une colonne de rattachement légère : `automation_id` /
  `campaign_id` (ou `job_id`), remplie à l'envoi. Sans elle, on ne peut pas
  agréger livré/lu **par** campagne.
- Recalculer les compteurs de campagne (`delivered_count`, `replied_count`) depuis
  ces vraies données (remplacer/auditer la RPC `update_campaign_stats`).

**Livrable** : funnel de livraison exact par campagne ET par automatisation, taux
d'échec réel.

### Coût / risque Phase 2
- Migrations DB + modif des 2 chemins d'envoi + webhook. Risque modéré (toucher à
  l'envoi réel) → à tester en prod sur 1 contact avant généralisation.

---

## PHASE 3 — Attribution du CA (ROAS)

**But** : « Cette campagne a généré X € » et un ROAS par campagne.

### 3.1 Attribution message → commande
- À la persistance d'une commande Shopify (`persist-order.ts` / `shopify-context.ts`),
  au lieu de marquer `ordered=true` sur TOUTES les assignations du contact :
  - relier la commande au **dernier message** envoyé au contact dans une **fenêtre
    d'attribution** (ex. 7 jours) → attribution last-touch bornée.
  - stocker le **montant** (`shopify_orders.total_price`) sur l'assignation / une
    table d'attribution `campaign_conversions(campaign_id|automation_id, contact_id,
    order_id, amount, attributed_at)`.

### 3.2 Affichage
- Dans le panneau Performance : **CA généré**, nb de commandes attribuées, **ROAS**
  (CA / coût — le « coût » = optionnel, à définir : coût des crédits/templates).

### Coût / risque Phase 3
- Nouvelle logique d'attribution + table + fenêtre temporelle. C'est le plus de
  valeur commerciale (prouver le ROI) mais le plus de travail.

---

## Fichiers touchés (récap)

| Phase | Fichiers |
|---|---|
| 1 | `api/automations/ab-summary/route.ts` (ou nouvelle `.../performance`), `components/automations/builder/workflow-builder.tsx` (bouton + panneau), nouveau composant `performance-panel.tsx` |
| 2 | `lib/automations/dispatch.ts`, `lib/campaigns/executor.ts`, `api/webhook/waba/route.ts`, migration `messages` (sent_at/delivered_at/automation_id/campaign_id), audit RPC `update_campaign_stats` |
| 3 | `lib/shopify/persist-order.ts` / `shopify-context.ts`, nouvelle table `campaign_conversions`, migration, extension du panneau |

## Ordre recommandé
1. **Phase 1** d'abord (valeur immédiate, visible, sans risque) — on livre, on voit.
2. **Phase 2** ensuite (fiabilise livré/lu, débloque le vrai funnel).
3. **Phase 3** en dernier (ROAS, le différenciateur commercial).

Chaque phase est autonome et livrable seule.
