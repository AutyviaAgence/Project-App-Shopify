# Autyvia v2 — Plan de refonte UX/UI

> Fichier de référence pour la grande refonte. Branche de travail : `dev`. Ne jamais merger sur `master` sans validation complète.
> Dernière mise à jour : après analyse Manychat/Respond.io et clarification des déclencheurs.

---

## Vision finale (arrêtée après itérations)

Plateforme d'automatisation WhatsApp simple et visuelle. L'agent IA est l'objet central — présenté comme une "fiche d'identité de robot" avec 4 sections empilées, chacune claire et éditable.

**Nos 2 seuls déclencheurs (et c'est suffisant) :**
1. Lien WhatsApp scanné → message pré-rempli envoyé → agent répond
2. Nouveau message reçu → agent répond

Pas de canvas/workflow complexe à la Manychat — nos déclencheurs sont trop simples pour justifier cette complexité. Le visuel passe par la page agent elle-même, pas par un éditeur de flux.

---

## Ce qu'on garde (ne pas toucher)

- Page **Dashboard** — OK
- Page **Conversations** — OK
- Page **Sessions** — OK
- Page **Stats** — OK
- Flow `/onboarding` (audit Stripe 750€+750€) — intact
- Systèmes : **Teams, Tags, Lifecycle, Logs, Settings, Admin** — intacts
- Prompt système — toujours accessible (section "Avancé" dépliable)

---

## Ce qu'on supprime / abandonne

- **Canvas React Flow / Studio** — trop complexe pour nos 2 déclencheurs
- **Page Campagnes** (UI uniquement, table DB conservée)
- **Workflow canvas** — le code existe sur dev mais ne sera pas mis en prod
- **Onboarding bloquant** — l'accès est libre après connexion

---

## Architecture des pages (finale)

### Sidebar
```
Dashboard
Conversations
Sessions
─────────────
Agents IA       ← page principale, liste des agents
Bibliothèque    ← docs + images (vue globale)
Liens           ← QR codes + liens WhatsApp
─────────────
Stats
Tags
Lifecycle
Teams
Settings
```

---

## Page Agents IA — La refonte principale

### Liste des agents (index)
- Grille de cards épurées
- Chaque card : nom, statut actif/inactif, modèle, nombre de conversations
- Bouton "Nouvel agent" → onboarding 3 étapes (template → personnalisation → création)
- Clic sur une card → page de détail de l'agent

### Page détail d'un agent — "Fiche robot"

**Header fixe en haut :**
```
┌────────────────────────────────────────────────────────┐
│  [Illustration robot SVG unique par agent]             │
│  Nom de l'agent                    [● Actif]  [Tester] │
│  GPT-4o Mini · Ton professionnel · Français            │
└────────────────────────────────────────────────────────┘
```

**4 sections empilées verticalement (cards dépliables) :**

#### Section 1 — "Qui il est"
Couleur : violet
Icône : Brain ou User
Contenu :
- Champ "Que fait cet agent ?" (description courte, visible sans déplier)
- Ton (Professionnel / Chaleureux / Décontracté) → 3 boutons radio visuels
- Langue (Auto-détection ou fixe)
- Section dépliable "Avancé" : prompt système complet, modèle, température, condition d'arrêt, délai de réponse, max messages

#### Section 2 — "Ce qu'il sait"
Couleur : bleu
Icône : BookOpen
Contenu :
- Liste des documents attachés (chips cliquables)
- Liste des images IA attachées
- Bouton "Ajouter un document" → ouvre dialog upload ou sélection depuis bibliothèque
- Bouton "Ajouter une image"

#### Section 3 — "Comment il réagit"
Couleur : orange
Icône : Zap
Contenu :
- Toggle "Escalade vers humain" + config (mots-clés, message)
- Toggle "Relance automatique" + config (délai, message, nb max)
- Lien de réservation (booking URL)
- Type d'agent (conversation / qualifier)

#### Section 4 — "Où il est actif"
Couleur : vert
Icône : Smartphone
Contenu :
- Sessions WhatsApp où l'agent est actif (toggle par session)
- Liens WhatsApp rattachés (cards mini avec QR)
- Bouton "Créer un lien" → dialog création lien rattaché à cet agent

---

## Bibliothèque (inchangée par rapport à la v2 actuelle)
- Vue unifiée documents + images
- Recherche + filtres
- Chaque item indique "Utilisé par X agents"

---

## Liens WhatsApp (inchangée par rapport à la v2 actuelle)
- Grille de cards avec QR code visible
- Stats clics / conversations
- Lien vers l'agent associé

---

## Onboarding v2 (/welcome-v2)
- 3 étapes : choix template → nom entreprise + ton → création
- L'agent créé arrive directement sur sa fiche détail
- Non bloquant : bouton "Passer" disponible à chaque étape

---

## Ordre d'implémentation

1. **Page détail agent** — la fiche robot avec 4 sections (priorité absolue)
2. **Page liste agents** — refonte des cards avec lien vers détail
3. **Onboarding** → redirige vers fiche détail après création
4. **Bibliothèque** → déjà fait, ajuster "Utilisé par X agents"
5. **Liens** → déjà fait, ajouter lien vers agent associé

---

## Design des sections — Détail visuel

Chaque section est une card avec :
- Header coloré : grande icône à gauche + titre + description courte + état résumé
- Corps dépliable : les champs de config
- Sauvegarde auto (debounce 1s) ou bouton "Enregistrer" dans chaque section

Illustration robot en header :
- SVG simple, style "friendly robot"
- Couleur primaire du tenant (s'adapte à Autyvia/Xeyo)
- Unique par agent (couleur ou accessoire différent selon le template)

---

## Ce qu'on abandonne définitivement

- Canvas React Flow (code conservé sur dev mais non utilisé)
- Studio page (/studio)
- AgentsPanel, ResourcesPanel (composants studio)
- Page Campagnes (UI)
- Blocs workflow dans la sidebar

Le code est sur dev, pas sur master. On peut le réactiver si les besoins évoluent.
