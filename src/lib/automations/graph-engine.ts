import 'server-only'
import type { WorkflowGraph } from './graph-types'
import { findNode, triggerNode, nextNodes } from './graph-types'
import { evaluateCondition } from './graph-conditions'
import type { EventContext } from './types'

/**
 * Moteur d'exécution du graphe (state-machine).
 *
 * `stepWorkflow` part d'un nœud et avance dans le graphe en évaluant les
 * conditions, jusqu'à tomber sur :
 *   - une ACTION  → on renvoie { kind:'send', templateId, nextNodeId }
 *   - un DELAY    → on renvoie { kind:'wait', minutes, nextNodeId }
 *   - la fin      → on renvoie { kind:'done' }
 *
 * Le cron rappelle stepWorkflow après chaque délai/envoi pour continuer.
 * On traverse trigger/condition en une seule passe (instantanés) ; on s'arrête
 * sur delay (re-planifie) et sur action (on envoie puis on continue).
 */

export type WorkflowStep =
  | { kind: 'send'; templateId: string; nextNodeId: string | null }
  | { kind: 'wait'; minutes: number; nextNodeId: string }
  | { kind: 'done' }

/**
 * @param fromNodeId  nœud de départ (null = partir du trigger)
 * @param skipCurrentDelay  si on vient de finir d'attendre ce delay, on le saute
 */
export function stepWorkflow(
  graph: WorkflowGraph,
  ctx: EventContext,
  fromNodeId: string | null,
  skipCurrentDelay = false,
): WorkflowStep {
  // Point de départ
  let nodeId: string | undefined
  if (fromNodeId) {
    nodeId = fromNodeId
  } else {
    const trig = triggerNode(graph)
    if (!trig) return { kind: 'done' }
    nodeId = nextNodes(graph, trig.id)[0]
  }

  let guard = 0 // garde-fou anti-boucle
  while (nodeId && guard++ < 200) {
    const node = findNode(graph, nodeId)
    if (!node) return { kind: 'done' }

    if (node.type === 'delay') {
      if (skipCurrentDelay) {
        // On a déjà attendu ce delay → on passe au suivant.
        skipCurrentDelay = false
        nodeId = nextNodes(graph, node.id)[0]
        continue
      }
      const next = nextNodes(graph, node.id)[0]
      if (!next) return { kind: 'done' }
      return { kind: 'wait', minutes: node.minutes || 0, nextNodeId: node.id }
    }

    if (node.type === 'condition') {
      const ok = evaluateCondition(node.rule, ctx)
      const branch = ok ? 'yes' : 'no'
      nodeId = nextNodes(graph, node.id, branch)[0]
      continue
    }

    if (node.type === 'action') {
      if (!node.templateId) {
        // action sans template → on saute
        nodeId = nextNodes(graph, node.id)[0]
        continue
      }
      const next = nextNodes(graph, node.id)[0] || null
      return { kind: 'send', templateId: node.templateId, nextNodeId: next }
    }

    // trigger ou type inconnu → avancer
    nodeId = nextNodes(graph, node.id)[0]
  }

  return { kind: 'done' }
}
