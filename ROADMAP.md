# Roadmap Xeyo — Helpdesk SAV e-commerce (WhatsApp + Email + Shopify)

> Positionnement gagnant : **« Les actions Shopify de Gorgias + le WhatsApp natif de
> Respond.io, sans la double facturation IA. »**
> Force unique : Shopify ET WhatsApp profondément intégrés (Gorgias est faible sur
> WhatsApp, Respond.io faible sur Shopify).

Dernière mise à jour : 2026-06-10

---

## État actuel (maturité par zone)

| Zone | Maturité | Note |
|------|----------|------|
| Conversations WhatsApp | 🟢 90% | Solide |
| RAG / Base de connaissances | 🟢 80% | Solide |
| Agents IA | 🟡 70% | Core OK, UI à simplifier |
| Campagnes | 🟡 65% | Refondu (templates Meta + mode auto/manuel) |
| Shopify | 🟡 60% | Actions de base OK, SAV avancé + contexte ticket manquants |
| Templates WhatsApp | 🟡 50% | UI OK, soumission Meta à finir |
| Bascule IA/template 24h | 🔴 0% | **Bloquant prod** |
| Conformité RGPD | 🟡 40% | Pages légales OK, webhooks Shopify à finir |

---

## P1 — Cœur bloquant (à faire avant la prod)

- [ ] **Bascule IA / template 24h** — Hors fenêtre 24h, Meta refuse le texte libre.
      Sans ça l'app échoue à envoyer. Le socle (`window.ts`) existe ; il faut
      l'appliquer dans le flux d'envoi (forcer un template approuvé hors 24h).
- [ ] **Soumission template à Meta** — UI de création OK ; manque le bouton
      « Soumettre à Meta » + polling du statut (PENDING → APPROVED/REJECTED) +
      webhook Meta de mise à jour de statut.
- [ ] **Contexte Shopify dans le ticket** — Afficher commande / suivi / historique
      d'achat à côté de la conversation (le moat de Gorgias). Données déjà
      accessibles via l'API Shopify, manque l'affichage.

## P2 — Compétitivité (table stakes helpdesk)

- [ ] **Macros** — Réponse pré-enregistrée + action (tag, assign, refund) en 1 clic.
      ⚠️ `canned_responses` supprimé (table vide, jamais finie) → à reconstruire proprement.
- [ ] **Suggestions de réponse IA** + **résumés de conversation** — standard 2025.
- [ ] **Help Center / FAQ** alimentant l'IA — réduit le volume de 40-60% et sert de
      knowledge base à l'agent.
- [ ] **SLA + analytics** — FRT, taux de résolution, perf par canal ; cibles SLA.

## P3 — Différenciation (gagner des deals)

- [ ] **Pricing transparent sans double-facture** — LA douleur du marché (Gorgias
      facture le ticket ET la résolution IA). Argument commercial direct.
- [ ] **IA multimodale WhatsApp** — lire une photo produit défectueux, une note
      vocale (Respond.io le fait, pas Gorgias). Très concret pour le SAV.
- [ ] **Actions Shopify autonomes avancées** — exécuter retour/échange sans humain.
- [ ] **IA pre-purchase** — reco produits, upsell, codes promo pendant le chat
      (transforme le SAV de coût en revenu).

## Finition campagnes (entamé)

- [ ] **Moteur d'exécution des déclencheurs auto** — cron/webhook qui déclenche les
      campagnes auto (inactivité, événement Shopify, date, tag). Form + DB prêts.
- [ ] **UI édition campagne** — appliquer le même traitement template que `/new`.
- [ ] **Page campagnes dans la nav** — décider de la remettre ou non.

## À supprimer / simplifier (prudemment — code critique)

- [ ] Booking / RDV (tables vides, hors scope SAV)
- [ ] Affiliation / Referral (pas le cœur produit)
- [ ] Outils IA dispersants : WooCommerce, Google Sheets, Distance Calculator
      (focus = Shopify + WhatsApp)
- [ ] `welcome-v2` (doublon de `welcome`)
- [ ] Agent type « qualifier » (logique opaque, peu utilisée)

## Infra / dette

- [ ] Fuite mémoire Traefik (boucle ACME sur domaines Cloudflare) — config DNS-01
      ou désactiver Let's Encrypt pour les domaines déjà couverts.
- [ ] Webhooks RGPD Shopify (`customers/redact`, `shop/redact`) à déclarer.
- [ ] Régénérer les secrets de prod exposés (Stripe live, OpenAI, JWT, DB password).

---

## Les 8 incontournables d'un helpdesk e-commerce (référence)

1. Inbox unifié multi-canal — 🟢 fait
2. Données Shopify dans le ticket — 🟡 P1
3. Actions Shopify natives — 🟢 fait
4. Agent IA autonome à résolution — 🟢 fait
5. Macros / réponses pré-enregistrées — 🔴 P2
6. Automatisation par règles/workflows — 🟡 (campagnes)
7. Self-service / Help Center — 🔴 P2
8. Analytics & SLA — 🟡 P2

_Sources : Gorgias, Respond.io, Tidio/Lyro, Crisp, Zendesk, Intercom/Fin (recherche 2025-2026)._
