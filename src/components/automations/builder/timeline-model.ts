import type { WorkflowGraph, WorkflowNode, ConditionRule, NodePosition } from '@/lib/automations/graph-types'
import type { TriggerEvent } from '@/lib/automations/types'

/**
 * Modèle de TIMELINE : on lit le graphe comme une suite verticale de blocs.
 * Une condition ouvre deux branches (oui / non) qui contiennent chacune leur
 * propre suite de blocs. C'est une vue simplifiée et GUIDÉE du graphe — pas de
 * drag & drop : on insère via des boutons "+", la structure reste alignée.
 *
 * On garde le même WorkflowGraph en stockage (compatible avec le moteur), mais
 * on impose une forme "arbre" : chaque nœud (hors condition) a 0 ou 1 enfant ;
 * une condition a une branche "yes" et une branche "no".
 */

// ---- Lecture : graphe → séquence linéaire de la branche principale ----------

/** Renvoie la liste ordonnée des ids depuis un nœud, en suivant la branche. */
export function chainFrom(graph: WorkflowGraph, startId: string | undefined, branch?: 'yes' | 'no'): string[] {
  const out: string[] = []
  let cur = startId
    ? graph.edges.find((e) => e.from === startId && (branch === undefined || e.branch === branch))?.to
    : undefined
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    const node = graph.nodes.find((n) => n.id === cur)
    // Une condition arrête la chaîne linéaire (ses branches sont rendues à part).
    if (node?.type === 'condition') break
    cur = graph.edges.find((e) => e.from === cur)?.to
  }
  return out
}

export function getNode(graph: WorkflowGraph, id: string): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}

export function getTrigger(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.type === 'trigger')
}

// ---- Édition : insertion / suppression dans la timeline ----------------------

let _seq = 0
function newId(prefix: string): string {
  _seq += 1
  return `${prefix}_${_seq}_${Math.floor(performance.now())}`
}

function blankNode(kind: 'delay' | 'condition' | 'action'): WorkflowNode {
  if (kind === 'delay') return { id: newId('delay'), type: 'delay', minutes: 60 }
  if (kind === 'condition') return { id: newId('cond'), type: 'condition', rule: { field: 'order_total', op: '>', value: 50 } as ConditionRule }
  return { id: newId('action'), type: 'action', templateId: null }
}

/**
 * Insère un nouveau nœud APRÈS `afterId` (sur la branche donnée si afterId est
 * une condition). Reconnecte proprement : after → new → (ancien suivant).
 */
export function insertAfter(
  graph: WorkflowGraph,
  afterId: string,
  kind: 'delay' | 'condition' | 'action',
  branch?: 'yes' | 'no',
): WorkflowGraph {
  const node = blankNode(kind)
  const nodes = [...graph.nodes, node]
  // arête sortante existante depuis afterId (sur la bonne branche)
  const existing = graph.edges.find((e) => e.from === afterId && (branch === undefined || e.branch === branch))
  const edges = graph.edges.filter((e) => e !== existing)
  edges.push({ from: afterId, to: node.id, branch })
  // Si une condition, on lui crée 2 branches vides (oui/non) — sinon on relie
  // le nouveau nœud à l'ancien suivant.
  if (kind === 'condition') {
    // les branches restent vides ; l'ancien suivant est rebranché sur "yes"
    if (existing) edges.push({ from: node.id, to: existing.to, branch: 'yes' })
  } else if (existing) {
    edges.push({ from: node.id, to: existing.to })
  }
  return { ...graph, nodes, edges }
}

/** Supprime un nœud et recoud la chaîne (son parent pointe vers son enfant). */
export function removeNode(graph: WorkflowGraph, id: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node || node.type === 'trigger') return graph
  const incoming = graph.edges.find((e) => e.to === id)
  const outgoing = graph.edges.find((e) => e.from === id && (e.branch === undefined || e.branch === 'yes'))
  const nodes = graph.nodes.filter((n) => n.id !== id)
  let edges = graph.edges.filter((e) => e.from !== id && e.to !== id)
  // recoud : parent → enfant (en gardant la branche du parent)
  if (incoming && outgoing) edges = [...edges, { from: incoming.from, to: outgoing.to, branch: incoming.branch }]
  return { ...graph, nodes, edges }
}

/** Met à jour les données d'un nœud. */
export function patchNode(graph: WorkflowGraph, id: string, patch: Partial<WorkflowNode>): WorkflowGraph {
  return { ...graph, nodes: graph.nodes.map((n) => n.id === id ? ({ ...n, ...patch } as WorkflowNode) : n) }
}

export type { WorkflowGraph, WorkflowNode, NodePosition, TriggerEvent }
