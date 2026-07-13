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

export type TriggerNode = {
  id: string; type: 'trigger'; event: TriggerEvent
  // Paramètres des triggers temporels :
  inactivityHours?: number   // no_customer_reply : délai sans réponse
  scheduledAt?: string       // scheduled_date : instant absolu (ISO UTC)
  scheduledTz?: string       // scheduled_date : fuseau de SAISIE/AFFICHAGE (ex. 'Europe/Paris').
                             // N'influence pas l'exécution : scheduledAt est déjà absolu.
  buttonText?: string        // button_clicked : libellé du bouton qui déclenche
}
export type DelayNode = { id: string; type: 'delay'; minutes: number }
export type ConditionNode = { id: string; type: 'condition'; rule: ConditionRule; label?: string }
export type ActionNode = {
  id: string; type: 'action'; templateId: string | null; label?: string
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
- delay     : { id, type:"delay", minutes }, attente (minutes, 0 = immédiat).
              Ex. 1440 = 1 jour, 4320 = 3 jours.
- condition : { id, type:"condition", rule:{ field, op, value }, label? }
              field ∈ order_total | is_first_order | product_contains |
              collection_contains | country | language | has_stage
              op ∈ > >= < <= == != contains has_any has_none
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
  branch:"button:__timeout__" = la SUITE PAR DÉFAUT (continuité du parcours,
  envoyée immédiatement, que le contact clique ou non).
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
