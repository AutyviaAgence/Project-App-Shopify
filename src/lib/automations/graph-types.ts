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

export type ConditionOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'contains'

export type ConditionRule = {
  field: ConditionField
  op: ConditionOp
  value: string | number | boolean
}

// ---- Nœuds ---------------------------------------------------------------

export type TriggerNode = {
  id: string; type: 'trigger'; event: TriggerEvent
  // Paramètres des triggers temporels :
  inactivityHours?: number   // no_customer_reply : délai sans réponse
  scheduledAt?: string       // scheduled_date : date/heure ISO
  buttonText?: string        // button_clicked : libellé du bouton qui déclenche
}
export type DelayNode = { id: string; type: 'delay'; minutes: number }
export type ConditionNode = { id: string; type: 'condition'; rule: ConditionRule; label?: string }
export type ActionNode = { id: string; type: 'action'; templateId: string | null; label?: string }

export type WorkflowNode = TriggerNode | DelayNode | ConditionNode | ActionNode
export type NodeType = WorkflowNode['type']

// Position pour le canvas (React Flow). Optionnelle : le moteur ne s'en sert pas.
export type NodePosition = { x: number; y: number }

// ---- Arêtes --------------------------------------------------------------

/** Une arête relie deux nœuds. `branch` n'a de sens que pour un ConditionNode. */
export type WorkflowEdge = {
  from: string
  to: string
  branch?: 'yes' | 'no'
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

export function triggerNode(graph: WorkflowGraph): TriggerNode | undefined {
  return graph.nodes.find((n): n is TriggerNode => n.type === 'trigger')
}

/** Le(s) nœud(s) suivant(s) à partir d'un nœud, en suivant une branche donnée. */
export function nextNodes(graph: WorkflowGraph, fromId: string, branch?: 'yes' | 'no'): string[] {
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
    if (n.type === 'condition') {
      const yes = graph.edges.some((e) => e.from === n.id && e.branch === 'yes')
      const no = graph.edges.some((e) => e.from === n.id && e.branch === 'no')
      if (!yes && !no) errors.push(`La condition "${n.label || n.id}" n'a aucune branche.`)
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

NŒUDS (nodes) — chaque nœud a un "id" unique (string) et un "type" :
- trigger   : { id, type:"trigger", event } — déclencheur Shopify. event ∈
              order_created | order_paid | order_fulfilled | order_cancelled |
              refund_created | checkout_abandoned. UN SEUL trigger par workflow.
- delay     : { id, type:"delay", minutes } — attente (minutes, 0 = immédiat).
- condition : { id, type:"condition", rule:{ field, op, value }, label? }
              field ∈ order_total | is_first_order | product_contains |
              collection_contains | country | language
              op ∈ > >= < <= == != contains
- action    : { id, type:"action", templateId, label? } — envoie un modèle WhatsApp.

ARÊTES (edges) — relient les nœuds : { from, to, branch? }
- "branch" vaut "yes" ou "no" UNIQUEMENT pour les arêtes sortant d'une condition.
- les autres nœuds ont une seule arête sortante (sans branch).

Règles : exactement 1 trigger ; chaque action doit avoir un templateId ;
une condition doit avoir au moins une branche (yes/no).
`
