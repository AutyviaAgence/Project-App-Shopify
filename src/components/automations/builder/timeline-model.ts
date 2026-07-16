import type { WorkflowGraph, WorkflowNode, ConditionRule, NodePosition } from '@/lib/automations/graph-types'
import { variantBranch, isButtonBranch, BUTTON_TIMEOUT_BRANCH } from '@/lib/automations/graph-types'
import type { TriggerEvent } from '@/lib/automations/types'

export type InsertKind = 'delay' | 'condition' | 'action' | 'ab_test'

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
export function chainFrom(graph: WorkflowGraph, startId: string | undefined, branch?: string): string[] {
  const out: string[] = []
  let cur = startId
    ? graph.edges.find((e) => e.from === startId && (branch === undefined || e.branch === branch))?.to
    : undefined
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    const node = graph.nodes.find((n) => n.id === cur)
    // Une condition ou un test A/B arrêtent la chaîne (branches rendues à part).
    if (node?.type === 'condition' || node?.type === 'ab_test') break
    // Un message à boutons quick-reply ouvre aussi ses propres branches
    // (`button:<texte>`) rendues séparément → on arrête ici, sinon la suite
    // apparaîtrait à la fois dans la chaîne ET sous un bouton.
    if (graph.edges.some((e) => e.from === cur && isButtonBranch(e.branch))) break
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

function blankNode(kind: InsertKind): WorkflowNode {
  if (kind === 'delay') return { id: newId('delay'), type: 'delay', minutes: 60 }
  if (kind === 'condition') return { id: newId('cond'), type: 'condition', rule: { field: 'order_total', op: '>', value: 50 } as ConditionRule }
  if (kind === 'ab_test') return { id: newId('ab'), type: 'ab_test', variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50 }] }
  return { id: newId('action'), type: 'action', templateId: null }
}

/**
 * Insère un nouveau nœud APRÈS `afterId` (sur la branche donnée si afterId est
 * une condition/test A/B). Reconnecte proprement : after → new → (ancien suivant).
 */
export function insertAfter(
  graph: WorkflowGraph,
  afterId: string,
  kind: InsertKind,
  branch?: string,
): WorkflowGraph {
  const node = blankNode(kind)
  const nodes = [...graph.nodes, node]
  // arête sortante existante depuis afterId (sur la bonne branche)
  const existing = graph.edges.find((e) => e.from === afterId && (branch === undefined || e.branch === branch))
  const edges = graph.edges.filter((e) => e !== existing)
  edges.push({ from: afterId, to: node.id, branch })
  // Condition → 2 branches (l'ancien suivant rebranché sur "yes").
  // Test A/B → une branche par variante (l'ancien suivant sur la 1re variante).
  if (kind === 'condition') {
    if (existing) edges.push({ from: node.id, to: existing.to, branch: 'yes' })
  } else if (kind === 'ab_test' && node.type === 'ab_test') {
    if (existing) edges.push({ from: node.id, to: existing.to, branch: variantBranch(node.variants[0].key) })
  } else if (existing) {
    edges.push({ from: node.id, to: existing.to })
  }
  return { ...graph, nodes, edges }
}

/** Ajoute une variante (jusqu'à 4) à un nœud A/B, ré-équilibre les poids. */
export function addVariant(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node || node.type !== 'ab_test' || node.variants.length >= 4) return graph
  const nextKey = ['A', 'B', 'C', 'D'][node.variants.length]
  const variants = [...node.variants, { key: nextKey, weight: 0 }]
  // Répartit équitablement (arrondi, le reste sur la 1re).
  const even = Math.floor(100 / variants.length)
  variants.forEach((v, i) => { v.weight = even })
  variants[0].weight = 100 - even * (variants.length - 1)
  const nodes = graph.nodes.map((n) => n.id === nodeId ? { ...node, variants } : n)
  return { ...graph, nodes }
}

/** Retire une variante (min 2) d'un nœud A/B + sa branche, ré-équilibre. */
export function removeVariant(graph: WorkflowGraph, nodeId: string, key: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node || node.type !== 'ab_test' || node.variants.length <= 2) return graph
  const variants = node.variants.filter((v) => v.key !== key)
  const even = Math.floor(100 / variants.length)
  variants.forEach((v) => { v.weight = even })
  variants[0].weight = 100 - even * (variants.length - 1)
  const nodes = graph.nodes.map((n) => n.id === nodeId ? { ...node, variants } : n)
  // Supprime la branche de la variante retirée (et ce qui en dépend).
  const edges = graph.edges.filter((e) => !(e.from === nodeId && e.branch === variantBranch(key)))
  return { ...graph, nodes, edges }
}

/**
 * Supprime un nœud et RECOUD la chaîne (son parent pointe vers son enfant).
 *
 * ⚠️ SUPPRIMER UN NŒUD NE DOIT JAMAIS EMPORTER LA SUITE DU PARCOURS.
 *
 * Le bug : on ne cherchait la sortie que parmi `branch === undefined` ou `'yes'`.
 * Or un MESSAGE À BOUTONS n'a que des sorties `button:…`, et un test A/B que des
 * `variant:…` — aucune ne correspondait, donc `outgoing` restait vide et RIEN
 * n'était recousu : tout ce qui suivait devenait orphelin et disparaissait de
 * l'écran. Le marchand devait reconstruire sa branche entière pour avoir retiré
 * un seul bloc.
 *
 * On prend désormais la suite RÉELLE du nœud, quelle que soit l'étiquette de son
 * arête. Pour un nœud qui se ramifie (boutons, condition, A/B), on garde la
 * branche par défaut si elle existe — c'est le fil principal du parcours — et à
 * défaut la première sortie : mieux vaut recoudre sur une branche que perdre
 * toute la suite.
 */
export function removeNode(graph: WorkflowGraph, id: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node || node.type === 'trigger') return graph
  const incoming = graph.edges.find((e) => e.to === id)

  const outs = graph.edges.filter((e) => e.from === id)
  // Ordre de préférence : la suite normale (sans branche) → la suite par défaut
  // d'un message à boutons → la branche « oui » d'une condition → à défaut, la
  // première sortie venue.
  const outgoing =
    outs.find((e) => e.branch === undefined)
    || outs.find((e) => e.branch === BUTTON_TIMEOUT_BRANCH)
    || outs.find((e) => e.branch === 'yes')
    || outs[0]

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

/**
 * Déplace la suite d'une branche vers une AUTRE branche du même nœud.
 *
 * Cas d'usage : le marchand a construit sa suite sous « Par défaut » et veut
 * qu'elle parte de « Code promo ». Sans ça il était bloqué — il fallait tout
 * supprimer et refaire sous la bonne branche, alors que seule l'étiquette de
 * l'arête change.
 *
 * Si la branche d'ARRIVÉE a déjà une suite, on ÉCHANGE les deux : rien n'est
 * perdu. Écraser silencieusement le travail du marchand serait pire que de ne
 * rien faire.
 */
export function moveBranch(
  graph: WorkflowGraph,
  fromId: string,
  branchFrom: string,
  branchTo: string
): WorkflowGraph {
  if (branchFrom === branchTo) return graph
  const src = graph.edges.find((e) => e.from === fromId && e.branch === branchFrom)
  if (!src) return graph
  const dst = graph.edges.find((e) => e.from === fromId && e.branch === branchTo)

  // Vérifié : `validateGraph` n'exige qu'AU MOINS UNE branche sur une condition,
  // pas les deux. Déplacer « Oui » vers un « Non » vide laisse donc une condition
  // à une seule branche — c'est valide, et c'est exactement ce que le marchand a
  // demandé. L'UI réaffiche la colonne vide avec son bouton « + ».
  const edges = graph.edges.map((e) => {
    if (e.from !== fromId) return e
    if (e.branch === branchFrom) return { ...e, branch: branchTo }
    // La cible existe → elle prend la place libérée (échange, pas écrasement).
    if (dst && e.branch === branchTo) return { ...e, branch: branchFrom }
    return e
  })
  return { ...graph, edges }
}

export type { WorkflowGraph, WorkflowNode, NodePosition, TriggerEvent }
