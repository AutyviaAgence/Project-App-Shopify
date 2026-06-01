# Autyvia v2 — Plan de refonte UX/UI

> Fichier de référence pour la grande refonte. Branche de travail : `dev`. Ne jamais merger sur `master` sans validation complète.

---

## Vision

Passer d'une plateforme "outil technique pour experts IA" à une plateforme "automatisation WhatsApp accessible à tous". L'utilisateur doit avoir son premier agent actif en moins de 5 minutes, sans jamais voir un prompt système s'il ne le veut pas.

Inspirations :
- **Blowup** : onboarding progressif, résultat immédiat, templates prêts à l'emploi
- **Manychat** : éditeur visuel de flux (canvas), blocs glissables, preview mobile
- **Zapier/n8n** : logique de workflow claire, conditions, branches

---

## Ce qu'on garde (ne pas toucher)

- Page **Dashboard** — OK
- Page **Conversations** — OK
- Page **Sessions** — OK
- Page **Stats** — OK
- Flow `/onboarding` (audit Stripe 750€+750€) — intact
- Système de **Teams** — intact
- Système de **Tags** — intact
- Système de **Lifecycle** — intact
- Système de **Logs** — intact
- Système de **Settings** — intact
- Système de **Admin** — intact
- Prompt système visible — toujours accessible pour les utilisateurs avancés (section "Avancé" dépliable)

---

## Ce qu'on supprime

- **Page Campagnes** (`/campaigns`) — remplacée par un bloc "Relance" dans le workflow
- Formulaire de création d'agent actuel (trop complexe, trop de champs exposés)
- Onboarding bloquant actuel (parcours libre après connexion)

---

## Chantiers principaux

### 1. Nouvel Onboarding (Priorité 1)

**Objectif** : premier agent actif en < 5 minutes.

Étapes :
1. Connexion WhatsApp (QR code ou WABA)
2. Choix d'un template d'agent (4 cards visuelles)
3. Personnalisation minimale (3 champs : nom entreprise, ton, langue)
4. Test dans simulateur de conversation
5. Agent activé — dashboard avec stat en temps réel

Templates disponibles dès le départ :
- Support client FAQ
- Prise de rendez-vous
- Qualification de leads
- Vente & catalogue

**Notes** :
- L'onboarding n'est plus bloquant — l'utilisateur peut passer au dashboard directement
- Le prompt système est généré automatiquement depuis le template + les 3 champs
- Un lien "Personnaliser le prompt" ouvre la section avancée

---

### 2. Canvas Workflow Visuel (Priorité 2 — gros chantier)

**Lib choisie** : `@xyflow/react` (React Flow) — utilisé par Zapier, Stripe, Retool.

**Concept** : chaque agent IA devient un "workflow" visuel avec des blocs connectés.

#### Blocs disponibles

| Bloc | Description |
|------|-------------|
| 🟢 **Déclencheur** | Point d'entrée — nouveau message reçu |
| 🤖 **Agent IA** | Répond avec l'IA (prompt configurable, section avancée dépliable) |
| 💬 **Message fixe** | Envoie un texte statique |
| 🖼️ **Média** | Envoie une image/document depuis la bibliothèque |
| ❓ **Condition** | Branche selon mot-clé, heure, tag, statut |
| ⏰ **Relance** | Si pas de réponse après X heures/jours → envoie un message |
| 👤 **Escalade** | Transfère à un agent humain |
| 🔗 **Redirection** | Route vers un autre workflow/agent |
| 📅 **Booking** | Propose un lien de rendez-vous |
| 🏷️ **Tag** | Ajoute/retire un tag au contact |
| 🛑 **Stop** | Fin du workflow |

#### Interface canvas
- Panneau gauche : bibliothèque de blocs (drag & drop)
- Centre : canvas React Flow (zoom, pan, connexions)
- Panneau droit : configuration du bloc sélectionné
- Preview mobile en bas à droite : simulation de la conversation

#### Bloc "Agent IA" — configuration
- Champ simple : "Que doit faire cet agent ?" (textarea courte)
- Section dépliable "⚙️ Avancé" : prompt système complet éditable, température, modèle
- Connecter base de connaissances (toggle)
- Connecter outils (toggle)

#### Bloc "Relance" — remplace les campagnes
- Délai : X heures / X jours sans réponse
- Message de relance (texte ou template)
- Limite : nombre max de relances
- Condition d'arrêt : si réponse reçue → stop

---

### 3. Page Agents — Refonte (Priorité 3)

**Nouveau design** :
- Grille de cards épurées avec preview du workflow
- Badge : template utilisé, nb de blocs, statut actif/inactif
- Actions rapides : Éditer le workflow, Tester, Dupliquer, Activer/Désactiver
- Bouton "Créer un agent" → choix : template ou canvas vide

**Suppression** :
- Plus de wizard séparé (remplacé par l'onboarding + le canvas)
- Plus de formulaire à onglets (tout dans le canvas)

---

### 4. Bibliothèque (remplace Base de connaissances) (Priorité 4)

**Nouveau nom** : "Bibliothèque" dans la nav.

**Design** :
- Page unique avec recherche globale
- Upload drag & drop avec détection auto du type
- Cards avec aperçu du contenu extrait (premiers 200 chars)
- Badge "Utilisé par X agents" sur chaque document
- Section "Médias à envoyer" (images) avec preview direct, intégrée dans la même page
- Statuts en langage clair : "En cours d'analyse...", "Prêt", "Erreur — réessayer"

---

### 5. Portails (remplace Liens WhatsApp) (Priorité 5)

**Nouveau nom** : "Portails" dans la nav.

**Design** :
- QR code affiché directement sur chaque card
- Boutons : Copier le lien / Télécharger QR code
- Stats : scans, conversations démarrées, taux de conversion
- Création en 3 étapes : nom → session → workflow associé

---

### 6. Navigation & Design Global (Priorité 6)

**Nouvelle structure sidebar** :
```
📊 Dashboard
💬 Conversations
📱 Sessions
───────────────
⚡ Agents (workflows)
📚 Bibliothèque
🔗 Portails
───────────────
📈 Stats
🏷️ Tags
🔄 Lifecycle
───────────────
👥 Teams
⚙️ Settings
```

**Design** :
- Moins "dark IA", palette plus chaleureuse et accessible
- Typographie plus lisible, spacing généreux
- Empty states engageants avec CTA et illustration
- Tooltips contextuels remplacent le tour actuel

---

## Stack technique

| Élément | Choix |
|---------|-------|
| Canvas workflow | `@xyflow/react` (React Flow v12) |
| Stockage workflow | Table `agent_workflows` en DB (JSON du graph) |
| Templates | Fichiers JSON statiques dans `/lib/workflow-templates/` |
| Preview mobile | Composant React dans un iframe simulé |

### Schéma DB à ajouter

```sql
-- Workflows visuels
CREATE TABLE agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Templates de workflow
CREATE TABLE workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text, -- 'support', 'booking', 'leads', 'sales'
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

---

## Ordre d'implémentation

### Étape 1 — Fondations (à faire en premier)
- [ ] Installer `@xyflow/react`
- [ ] Créer la table `agent_workflows` en DB
- [ ] Créer 4 templates JSON de workflow de base
- [ ] Composant `WorkflowCanvas` vide (canvas + blocs de base)

### Étape 2 — Canvas fonctionnel
- [ ] Tous les types de blocs avec leur panneau de config
- [ ] Sauvegarde automatique du workflow en DB
- [ ] Bloc "Agent IA" avec section Avancé (prompt système)
- [ ] Bloc "Relance" (remplace campagnes)

### Étape 3 — Nouvel Onboarding
- [ ] Page de sélection de template (4 cards)
- [ ] Formulaire 3 champs → génération prompt auto
- [ ] Simulateur de conversation intégré
- [ ] Suppression du redirect onboarding bloquant

### Étape 4 — Refonte pages
- [ ] Page Agents refonte (cards + lien vers canvas)
- [ ] Page Bibliothèque (fusion documents + images)
- [ ] Page Portails (refonte liens WhatsApp)

### Étape 5 — Navigation & Polish
- [ ] Nouvelle sidebar
- [ ] Suppression page Campagnes
- [ ] Empty states
- [ ] Design global

---

## Points d'attention

- **Prompt système** : toujours accessible via section "⚙️ Avancé" dépliable dans le bloc Agent IA — ne jamais le cacher complètement
- **Rétrocompatibilité** : les agents existants doivent continuer à fonctionner pendant la migration — créer un mode "legacy" pour les agents sans workflow
- **Branche** : tout le travail sur `dev`, jamais sur `master`
- **Campagnes existantes** : ne pas supprimer la table DB `campaigns` — juste masquer la page UI et migrer progressivement
