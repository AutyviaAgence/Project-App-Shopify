# Plan global — Onboarding, Bibliothèque d'automatisations, Stats agents

> 4 chantiers priorisés. Chacun est autonome et livrable seul. Tu tranches l'ordre.

---

## CHANTIER 1 — Doublons d'agents IA (rapide, gros impact visuel)

**Constat (DB réelle)** : 16 agents pour 1 user, dont **12 « Assistant Xeyo - Dev »**
créés à des dates espacées (9 juin → 13 juil). Cause : `POST /api/agents` n'a
**aucune déduplication** → chaque relance de l'onboarding / génération d'agent
référent recrée un agent. La page Stats affiche donc 7+ cartes identiques.

### À faire
1. **Nettoyage DB** (one-shot, via script) : pour chaque user, garder l'agent le
   plus pertinent par nom (le plus récent OU celui avec le plus de conversations),
   fusionner/supprimer les doublons. Ré-affecter les conversations/messages des
   doublons vers l'agent gardé (`UPDATE conversations SET ai_agent_id=… ` +
   messages) avant suppression, pour ne pas perdre l'historique.
2. **Prévention** : l'agent référent d'onboarding doit être créé de façon
   **idempotente**. Deux options :
   - a) `agents/route.ts` : si un agent de même nom existe déjà pour le user,
     réutiliser au lieu de créer (mode onboarding).
   - b) Marquer l'agent d'onboarding avec un flag (ex. `is_default=true`) et
     upsert dessus (1 seul agent par défaut par user).
   → Recommandé : (b) — un `is_default` unique par user, upsert.

**Livrable** : plus de doublons, page Stats lisible (1 carte par vrai agent).
**Risque** : faible (nettoyage réversible si on archive avant suppression).

---

## CHANTIER 2 — Stats agents fiables

**Constat (DB réelle)** : 73 messages sur 30 j, mais **seulement 13 ont
`ai_agent_id`** et **1 seule conversation** porte un `ai_agent_id`. Le calcul
(`stats/route.ts:278-312`) filtre sur `messages.ai_agent_id === agent.id` →
la plupart des agents affichent 0.

### Cause racine
`ai_agent_id` n'est pas systématiquement écrit sur les messages sortants de l'IA
ni sur les conversations. La stat n'a donc pas de quoi attribuer.

### À faire
1. **Écrire `ai_agent_id` à la source** : quand l'IA répond
   (`process-ai-response.ts`), tagger le message sortant avec l'agent qui l'a
   généré. Idem : la conversation doit porter l'`ai_agent_id` de l'agent assigné.
2. **Calcul plus robuste** (`stats/route.ts`) : à défaut d'`ai_agent_id` sur le
   message, retomber sur l'agent de la **conversation** (`conversationToAgent`),
   déjà partiellement fait pour le taux de réponse (l.287). L'appliquer aussi à
   `messagesHandled` et `conversationsManaged`.
3. **Backfill** (optionnel) : remplir `ai_agent_id` a posteriori sur les messages
   IA existants via l'agent de leur conversation.

**Livrable** : chaque agent montre ses vrais chiffres (messages, conversations,
taux, temps).
**Dépend de** : Chantier 1 (sinon les chiffres se répartissent sur des doublons).

---

## CHANTIER 3 — Onboarding remis à jour (Campagnes / Transactionnel)

**Constat** : l'onboarding précède la séparation `kind`. Bugs :
- `apply-pack/route.ts:161-176` crée les automatisations **sans `kind`** → toutes
  rangées en **Transactionnel** par défaut (`kindOf`, défaut transactional). Les
  campagnes marketing (anniversaire, planifié, opt-in, relances) atterrissent
  dans le mauvais onglet.
- `PackTriggerSpec`/`PackItem` (`pack-spec.ts`) n'ont **aucun** champ `kind`.
- L'étape « automations » groupe par famille d'événement (Commande/Contact/
  Conversation/Planifié), pas par Campagnes vs Transactionnel.

### À faire
1. **Ajouter `kind` au pack** : dériver `kind` de chaque trigger via
   `MARKETING_TRIGGERS`/`TRANSACTIONAL_TRIGGERS` (`types.ts`). Le stocker dans
   `PackItem`.
2. **`apply-pack` écrit `kind`** sur chaque automatisation créée → bon onglet.
3. **UI onboarding** : présenter clairement les 2 familles **Transactionnel**
   (statuts de commande, SAV) et **Campagnes** (marketing : bienvenue,
   anniversaire, relances, planifié), au lieu du découpage par événement. Réutiliser
   le vocabulaire des onglets Campagnes/Transactionnel.
4. (option) Corriger la navigation/étapes si d'autres incohérences apparaissent.

**Livrable** : après onboarding, les automatisations sont dans le bon onglet et
l'utilisateur comprend la distinction campagne/transactionnel.
**Risque** : moyen (touche le flux d'onboarding — tester le parcours complet).

---

## CHANTIER 4 — Bibliothèque d'automatisations prêtes à l'emploi (dont A/B)

**Constat** : une bibliothèque de **templates** existe déjà
(`default-templates.ts` + `/api/templates/library` + galerie). Mais **aucune
bibliothèque d'automatisations** pré-faites. À créer.

### À faire
1. **Fichier de presets** `src/lib/automations/library.ts` :
   `AUTOMATION_PRESETS: { key, kind, label, description, category, buildGraph() }[]`.
   Chaque preset construit un `WorkflowGraph` complet (trigger → délai → condition
   → action, ou trigger → **ab_test** → variantes → actions). Réutiliser le patron
   `buildGraph()` du wizard (`workflow-wizard.tsx:104-149`) pour les A/B (poids
   normalisés à 100, `validateGraph` OK).
   - Presets **transactionnels** : confirmation commande, expédition, livraison,
     relance panier abandonné…
   - Presets **campagnes (marketing)** : bienvenue opt-in, anniversaire, relance
     inactifs, **promo A/B** (2 variantes de message testées), planifié A/B…
2. **API** `GET /api/automations/library` (liste des presets, flag `added`) +
   `POST` pour matérialiser un preset en `automations` (avec `kind`, `graph`,
   `builder_mode:true`, `is_active:false`). Calquée sur `/api/templates/library`
   + `/api/templates/seed`.
3. **UI** : 3ᵉ carte « Partir d'un modèle » dans l'écran de choix
   (`automations/page.tsx:577-603`, à côté de Guidé/Manuel) → ouvre une galerie
   filtrée par onglet courant (Campagnes vs Transactionnel). Décalquer la galerie
   « Modèles suggérés » de `templates/page.tsx:880-971`.
4. (dépendance) Les presets référencent des templates : soit ils réutilisent les
   `DEFAULT_TEMPLATES`, soit ils créent les modèles nécessaires au passage.

**Livrable** : le marchand active une automatisation complète (dont A/B) en 1 clic,
dans le bon onglet.
**Risque** : moyen (nouvelle brique, mais isolée — pas de régression sur l'existant).

---

## Ordre recommandé

1. **Chantier 1** (doublons) — rapide, débloque la lisibilité des stats.
2. **Chantier 2** (stats agents) — dépend du 1.
3. **Chantier 4** (bibliothèque) — forte valeur, isolé, peut se faire en parallèle.
4. **Chantier 3** (onboarding) — le plus touchy, à faire quand le reste est stable.

Chaque chantier = commits séparés, testables indépendamment.

## Fichiers clés (récap)
- Doublons : `api/agents/route.ts`, script nettoyage DB.
- Stats : `lib/openai/process-ai-response.ts`, `api/stats/route.ts`.
- Onboarding : `lib/onboarding/pack-spec.ts`, `api/onboarding/apply-pack/route.ts`, `app/onboarding/page.tsx`.
- Bibliothèque : NOUVEAU `lib/automations/library.ts`, NOUVELLE route `api/automations/library`, `app/(dashboard)/automations/page.tsx`, patron `workflow-wizard.tsx:104-149`.
