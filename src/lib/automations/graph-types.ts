/**
 * Modèle de GRAPHE pour le Visual Builder d'automatisations.
 *
 * Un workflow = un graphe de nœuds reliés par des arêtes. Conçu pour être :
 *   - exécuté par le moteur (state-machine qui avance de nœud en nœud)
 *   - rendu par React Flow (canvas drag & drop)
 *   - GÉNÉRÉ et MODIFIÉ par l'IA (JSON simple, validable)
 */

import type { TriggerEvent } from './types'

// ---- Conditions ----------------------------------------------------------

export type ConditionField =
  | 'order_total'        // montant de la commande (nombre)
  | 'is_first_order'     // première commande du client (booléen)
  | 'product_contains'   // la commande contient un produit / mot-clé (texte)
  | 'collection_contains'// la commande contient une collection (texte)
  | 'country'            // pays du client (code ISO, ex: FR)
  | 'language'           // langue du client (ex: fr)
  | 'has_stage'          // le contact porte une étape/tag donné (id d'étape)

export type ConditionOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'contains' | 'has_any' | 'has_none'

export type ConditionRule = {
  field: ConditionField
  op: ConditionOp
  // has_stage : value = un ou plusieurs id d'étapes (tags). Les autres champs
  // utilisent un scalaire.
  value: string | number | boolean | string[]
}

// ---- Nœuds ---------------------------------------------------------------

/**
 * Combien de fois un même contact peut redéclencher l'automatisation.
 *
 * ⚠️ CE RÉGLAGE EST UN GARDE-FOU ANTI-BOUCLE, pas un confort.
 *
 * Certains déclencheurs décrivent un ÉTAT, pas un événement ponctuel : le
 * silence d'un client (`no_customer_reply`) dure tant qu'il se tait ; un message
 * lu (`message_read`) engendre un envoi, qui sera lu à son tour. Sans borne, ils
 * se réalimentent indéfiniment — c'est arrivé en production sur les deux.
 *
 * - `once`     : une seule fois par contact, jamais plus. DÉFAUT — sûr par
 *                construction, aucune boucle possible sans acte volontaire.
 * - `per_event`: à chaque occurrence. La récurrence devient un choix ASSUMÉ ;
 *                l'UI avertit du risque sur les déclencheurs qui s'auto-nourrissent.
 * - `daily`    : au plus une fois par jour et par contact (relance bornée).
 *
 * C'est la clé de déduplication qui applique tout ça, donc l'unicité
 * (automation_id, dedup_key) EN BASE — pas un compteur applicatif qu'une course
 * pourrait contourner.
 */
export type TriggerRecurrence = 'once' | 'per_event' | 'daily'

export type TriggerNode = {
  id: string; type: 'trigger'; event: TriggerEvent
  // Paramètres des triggers temporels :
  inactivityHours?: number   // no_customer_reply : délai sans réponse
  scheduledAt?: string       // scheduled_date : instant absolu (ISO UTC)
  scheduledTz?: string       // scheduled_date : fuseau de SAISIE/AFFICHAGE (ex. 'Europe/Paris').
                             // N'influence pas l'exécution : scheduledAt est déjà absolu.
  buttonText?: string        // button_clicked : libellé du bouton qui déclenche
  /** Récurrence par contact. Absent = 'once' (défaut sûr). Cf. TriggerRecurrence. */
  recurrence?: TriggerRecurrence
}
export type DelayNode = { id: string; type: 'delay'; minutes: number }
export type ConditionNode = { id: string; type: 'condition'; rule: ConditionRule; label?: string }
export type ActionNode = {
  id: string; type: 'action'; templateId: string | null; label?: string
  /**
   * Message RESTANT À CRÉER sur ce nœud (posé par l'assistant IA quand aucun
   * modèle existant ne convient).
   *
   * Sans ça, un nœud sans modèle n'affichait que « Choisir un modèle » : le
   * marchand voyait un trou, sans savoir qu'il y avait un message à écrire ni ce
   * qu'il devait dire — alors que l'IA venait justement de le lui décrire.
   */
  todo?: {
    /** À quoi sert ce message dans le parcours (1 phrase). */
    purpose: string
    /** Conseils de rédaction : angle, incitation, boutons à prévoir. */
    suggestion?: string
  }
  /** Message à boutons : autorise le contact à suivre PLUSIEURS réponses (il
   *  clique Oui, reçoit la branche Oui, puis peut cliquer Non et recevoir aussi
   *  la branche Non). Chaque bouton ne se déclenche qu'UNE fois. `false` ou
   *  absent = une seule route (le 1er clic ferme le funnel). Défaut UI = true. */
  allowMultiple?: boolean
}

/** Test A/B : répartit les contacts entre 2 à 4 variantes selon des poids (%).
 *  Chaque variante a une branche `variant:<key>` menant à sa propre suite. */
export type ABVariant = { key: string; weight: number }
export type ABTestNode = { id: string; type: 'ab_test'; variants: ABVariant[]; label?: string }

export type WorkflowNode = TriggerNode | DelayNode | ConditionNode | ActionNode | ABTestNode
export type NodeType = WorkflowNode['type']

/** Branche d'une arête sortant d'un test A/B : `variant:A`, `variant:B`… */
export function variantBranch(key: string): string {
  return `variant:${key}`
}

/** Branche d'une arête sortant d'un message À BOUTONS : `button:<libellé>`.
 *  Le libellé = le `text` du bouton quick-reply, exactement ce que le webhook
 *  capte au clic. Une branche spéciale `button:__timeout__` sert de sortie si
 *  le client ne clique jamais (anti-fuite). */
export function buttonBranch(text: string): string {
  return `button:${text}`
}
/** Vrai si la branche est une sortie de bouton. */
export function isButtonBranch(branch?: string): boolean {
  return typeof branch === 'string' && branch.startsWith('button:')
}
export const BUTTON_TIMEOUT_BRANCH = 'button:__timeout__'
/** Libellé porté par une branche `button:<x>` (undefined si ce n'en est pas une). */
export function buttonBranchLabel(branch?: string): string | undefined {
  return isButtonBranch(branch) ? branch!.slice('button:'.length) : undefined
}

// Position pour le canvas (React Flow). Optionnelle : le moteur ne s'en sert pas.
export type NodePosition = { x: number; y: number }

// ---- Arêtes --------------------------------------------------------------

/** Une arête relie deux nœuds. `branch` :
 *  - 'yes'/'no' pour une condition
 *  - 'variant:<key>' pour un test A/B (une branche par variante) */
export type WorkflowEdge = {
  from: string
  to: string
  branch?: string
}

// ---- Graphe complet ------------------------------------------------------

export type WorkflowGraph = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** Positions par node id (UI uniquement). */
  positions?: Record<string, NodePosition>
}

// ---- Helpers -------------------------------------------------------------

export function findNode(graph: WorkflowGraph, id: string): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}

/** Graphe de départ : un trigger relié à une action (le cas le plus simple). */
export function defaultGraph(event: TriggerEvent = 'order_fulfilled', templateId: string | null = null): WorkflowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'trigger', event },
      { id: 'action_1', type: 'action', templateId },
    ],
    edges: [{ from: 'trigger', to: 'action_1' }],
    positions: { trigger: { x: 120, y: 30 }, action_1: { x: 120, y: 220 } },
  }
}

/**
 * Graphe d'onboarding « intelligent » : construit un parcours ADAPTÉ au template
 * et au trigger, au lieu du simple trigger→message.
 *  - `delayMinutes` > 0 → insère un nœud `delay` (ex. panier abandonné à +N min).
 *  - le template a des boutons quick-reply → le marchand pourra brancher chaque
 *    bouton dans le builder ; à la création on n'ajoute PAS de branches vides
 *    (elles seraient obligatoires à remplir pour activer → frustrant). Le message
 *    reste un envoi simple, prêt à recevoir des branches quand le marchand veut.
 * Ainsi l'automatisation créée est déjà utilisable (envoi + délai) et reflète le
 * template, sans imposer de compléter des branches pour l'activer.
 */
export function buildOnboardingGraph(
  event: TriggerEvent,
  templateId: string | null,
  opts?: { delayMinutes?: number },
): WorkflowGraph {
  const delay = Math.max(0, Math.floor(opts?.delayMinutes || 0))
  const nodes: WorkflowNode[] = [{ id: 'trigger', type: 'trigger', event }]
  const edges: WorkflowGraph['edges'] = []
  const positions: Record<string, { x: number; y: number }> = { trigger: { x: 160, y: 30 } }
  let y = 30
  let prev = 'trigger'

  // Délai avant l'envoi (si le pack en prévoit un, ex. panier abandonné à +N min).
  if (delay > 0) {
    y += 160
    nodes.push({ id: 'delay_1', type: 'delay', minutes: delay })
    edges.push({ from: prev, to: 'delay_1' })
    positions['delay_1'] = { x: 160, y }
    prev = 'delay_1'
  }

  // Message principal. allowMultiple=true : si le marchand ajoute ensuite des
  // boutons, le funnel multi-route fonctionne d'emblée.
  y += 160
  nodes.push({ id: 'action_1', type: 'action', templateId, allowMultiple: true })
  edges.push({ from: prev, to: 'action_1' })
  positions['action_1'] = { x: 160, y }

  return { nodes, edges, positions }
}

export function triggerNode(graph: WorkflowGraph): TriggerNode | undefined {
  return graph.nodes.find((n): n is TriggerNode => n.type === 'trigger')
}

/** Le(s) nœud(s) suivant(s) à partir d'un nœud, en suivant une branche donnée. */
export function nextNodes(graph: WorkflowGraph, fromId: string, branch?: string): string[] {
  return graph.edges
    .filter((e) => e.from === fromId && (branch === undefined || e.branch === branch || e.branch === undefined))
    .map((e) => e.to)
}

/** Validation minimale : 1 trigger, pas d'arête orpheline, actions ont un template. */
export function validateGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = []
  const triggers = graph.nodes.filter((n) => n.type === 'trigger')
  if (triggers.length !== 1) errors.push('Le workflow doit avoir exactement un déclencheur.')
  const ids = new Set(graph.nodes.map((n) => n.id))
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Arête invalide ${e.from}→${e.to}.`)
  }
  for (const n of graph.nodes) {
    if (n.type === 'action' && !n.templateId) errors.push(`L'action "${n.label || n.id}" n'a pas de modèle.`)
    // Message à BOUTONS (fan-out) : si au moins une sortie est `button:`, TOUTES
    // les sorties doivent l'être (sinon l'edge sans branche est un wildcard qui
    // rendrait le branchement ambigu — cf. nextNodes).
    if (n.type === 'action') {
      const outs = graph.edges.filter((e) => e.from === n.id)
      const hasButton = outs.some((e) => isButtonBranch(e.branch))
      if (hasButton && outs.some((e) => !isButtonBranch(e.branch))) {
        errors.push(`Le message à boutons "${n.label || n.id}" a une sortie non reliée à un bouton.`)
      }
    }
    if (n.type === 'condition') {
      const yes = graph.edges.some((e) => e.from === n.id && e.branch === 'yes')
      const no = graph.edges.some((e) => e.from === n.id && e.branch === 'no')
      if (!yes && !no) errors.push(`La condition "${n.label || n.id}" n'a aucune branche.`)
    }
    if (n.type === 'ab_test') {
      if (!n.variants || n.variants.length < 2) errors.push(`Le test A/B "${n.label || n.id}" doit avoir au moins 2 variantes.`)
      else {
        const total = n.variants.reduce((s, v) => s + (Number(v.weight) || 0), 0)
        if (Math.round(total) !== 100) errors.push(`Le test A/B "${n.label || n.id}" : la somme des pourcentages doit faire 100 % (actuel : ${total} %).`)
        for (const v of n.variants) {
          if (!graph.edges.some((e) => e.from === n.id && e.branch === variantBranch(v.key))) {
            errors.push(`Le test A/B "${n.label || n.id}" : la variante ${v.key} n'a pas de suite.`)
          }
        }
      }
    }
  }
  return errors
}

/**
 * Schéma JSON décrivant le format de graphe, fourni à l'IA pour qu'elle
 * génère/modifie des workflows valides. (Description en langage naturel.)
 */
export const GRAPH_JSON_SCHEMA_DOC = `
# CE QUE TU CONSTRUIS N'EST PAS UN SCHÉMA, C'EST UNE CONVERSATION

Avant la syntaxe, comprends ce que tu fabriques : le fil de ce qu'UNE personne va
VIVRE sur WhatsApp. Elle reçoit un message, elle clique (ou pas), elle en reçoit
un autre. Elle ne voit ni tes nœuds ni tes branches — juste une suite de messages
dans sa conversation.

Un parcours se lit comme une histoire :
  « Marie abandonne son panier → 1 h plus tard elle reçoit un rappel avec deux
    boutons → elle clique "Oui, je veux un code promo" → elle reçoit le code →
    fin. Si elle avait cliqué "Non", elle aurait vu nos produits. Si elle n'avait
    rien cliqué, on l'aurait relancée le lendemain. »

AVANT DE RÉPONDRE, RACONTE-TOI CE FIL. Pour CHAQUE branche, demande-toi :
 - « Qu'est-ce que Marie reçoit, exactement, dans cet ordre ? »
 - « Ce message a-t-il un sens juste après le précédent ? »
 - « Est-ce qu'elle reçoit deux fois la même chose ? »
 - « Est-ce que ça s'arrête quelque part ? »
Si tu ne sais pas raconter une branche, c'est qu'elle est fausse : refais-la.

⚠️ ERREURS QUI RUINENT UN PARCOURS (toutes constatées) :
 - Chaque branche de bouton renvoie vers un message qui reparle des mêmes boutons
   → le client tourne en rond et voit s'empiler « Finaliser », « J'ai une
   question », « Utiliser le code »… Un parcours n'est PAS un labyrinthe.
 - On relance quelqu'un qui vient de dire oui.
 - Une branche se termine dans le vide sans que le client ait sa réponse.
 - Le graphe est touffu (10 nœuds pour 2 idées) : le marchand ne le comprend plus,
   donc il ne l'active pas. SIMPLE ET LISIBLE bat COMPLET ET ILLISIBLE.

RÈGLE DE SORTIE : une branche où le client a AGI (cliqué « Oui », « Finaliser »,
« J'en profite ») lui donne ce qu'il a demandé, puis S'ARRÊTE. On ne relance pas
quelqu'un qui a répondu — c'est le meilleur moyen de le faire bloquer.

Un workflow est un objet JSON { "nodes": [...], "edges": [...] }.

NŒUDS (nodes), chaque nœud a un "id" unique (string) et un "type" :
- trigger   : { id, type:"trigger", event }, UN SEUL par workflow. event ∈
              TRANSACTIONNEL : order_created | order_paid | order_fulfilled |
              order_delivered | order_cancelled | refund_created | return_requested
              MARKETING/CAMPAGNE : checkout_abandoned (panier abandonné) |
              contact_opted_in (nouvel abonné) | optin_popup | customer_birthday |
              scheduled_date (campagne planifiée) | no_customer_reply (relance) |
              message_read | button_clicked
              Paramètres optionnels selon l'event :
                scheduled_date     → "scheduledAt" (ISO UTC), "scheduledTz"
                no_customer_reply  → "inactivityHours" (nombre)
- delay     : { id, type:"delay", minutes }, attente avant le message suivant.
              Valeurs autorisées UNIQUEMENT : 0 (immédiat), 30, 60, 180,
              1440 (1 jour), 2880 (2 jours), 10080 (7 jours).
              ⚠️ Toute autre valeur s'affiche mal dans l'éditeur du marchand.
- condition : { id, type:"condition", rule:{ field, op, value }, label? }
              op ∈ > >= < <= == != contains has_any has_none
              Une condition SEGMENTE (deux publics → deux suites différentes).
              Elle ne peut PAS savoir ce que le client a fait APRÈS l'envoi.
              Champs, et ce qu'ils valent AU MOMENT du déclencheur :
                order_total         → montant de la commande OU du panier (nombre).
                                      ⚠️ Sur un panier abandonné il est TOUJOURS
                                      renseigné : « order_total > 0 » est donc
                                      toujours vrai et ne sert à rien. Ne l'utilise
                                      que pour un VRAI seuil (ex. > 100).
                is_first_order      → true/false : c'est sa 1re commande.
                product_contains    → un produit dont le titre contient X.
                collection_contains → un produit d'une collection X.
                country / language  → pays / langue du client.
                has_stage           → le contact porte telle étape/tag.
              ⚠️ AUCUN champ ne dit « a-t-il commandé depuis ? » ou « a-t-il
              cliqué ? » : ne l'invente pas. La relance d'un panier est annulée
              AUTOMATIQUEMENT si le client commande — n'ajoute pas de condition
              pour ça. Pour réagir à un clic, utilise une branche "button:".
- ab_test   : { id, type:"ab_test", variants:[{key,weight},…], label? }
              Test A/B : 2 à 4 variantes (key = "A","B","C","D"), la somme des
              "weight" DOIT faire exactement 100. Chaque variante mène à sa
              propre suite via une arête branch:"variant:A" etc.
- action    : { id, type:"action", templateId, label?, allowMultiple? }
              Envoie un modèle WhatsApp. templateId = id d'un modèle APPROUVÉ.

ARÊTES (edges) : { from, to, branch? }
- condition → 2 arêtes : branch:"yes" et branch:"no".
- ab_test   → 1 arête par variante : branch:"variant:A", "variant:B"…
- action à BOUTONS (le modèle a des boutons de réponse rapide) → 1 arête par
  bouton : branch:"button:<libellé exact du bouton>", PLUS une arête
  branch:"button:__timeout__" = la SUITE PAR DÉFAUT.

  ⚠️ LIS BIEN CECI, C'EST LA SOURCE D'ERREUR N°1 :
  « Par défaut » PART DANS TOUS LES CAS, que le client clique ou non. Ce n'est PAS
  la branche « il n'a pas cliqué » — c'est la continuité normale du parcours.
  Un client qui clique « Code promo » reçoit donc DEUX choses : la suite de son
  bouton, ET la suite par défaut.

  CONSÉQUENCES, à respecter :
   - NE METS JAMAIS le même message (ni un équivalent) sur un bouton ET sur « par
     défaut » : le client le recevrait deux fois. C'est arrivé.
   - Tu n'es PAS obligé de remplir « par défaut ». Si toute la suite dépend du
     clic (« s'il clique il reçoit le code, sinon rien »), NE METS AUCUNE arête
     button:__timeout__ : le parcours s'arrête pour qui ne clique pas, et c'est
     très bien.
   - Ne remplis « par défaut » QUE si tu veux vraiment envoyer quelque chose à
     TOUT LE MONDE — typiquement une relance 24 h plus tard.
- les autres nœuds : une seule arête sortante, sans "branch".

RÈGLES : exactement 1 trigger ; chaque action a un templateId ; une condition a
ses 2 branches ; un ab_test a ≥2 variantes dont les poids somment à 100 et chaque
variante a une suite.

FUNNEL DE VENTE (campagne) — enchaîne PLUSIEURS messages, ex :
trigger(checkout_abandoned) → delay(60) → action(rappel panier)
  → delay(1440) → condition(a commandé ?) --no--> ab_test(A 50 / B 50)
      → variant:A → action(promo -10%)
      → variant:B → action(livraison offerte)
`
