import 'server-only'
import type { WorkflowGraph } from './graph-types'
import { findNode, triggerNode, nextNodes, variantBranch, isButtonBranch, buttonBranchLabel, BUTTON_TIMEOUT_BRANCH } from './graph-types'
import { evaluateCondition } from './graph-conditions'
import type { EventContext } from './types'

/** Normalise un libellé de bouton pour comparaison (trim + minuscule). */
function normBtn(s: string): string {
  return (s || '').trim().toLowerCase()
}

/**
 * Un message à boutons a été envoyé, le contact vient de cliquer : renvoie le
 * node de reprise (le `to` de la branche `button:<libellé cliqué>`).
 * Fallback sur la branche timeout si le libellé ne matche aucun bouton.
 * Retourne null si aucune branche ne correspond (funnel terminé).
 */
export function resumeFromButton(graph: WorkflowGraph, actionNodeId: string, clickedText: string): string | null {
  const target = normBtn(clickedText)
  const outs = graph.edges.filter((e) => e.from === actionNodeId && isButtonBranch(e.branch))
  const match = outs.find((e) => normBtn(buttonBranchLabel(e.branch) || '') === target && e.branch !== BUTTON_TIMEOUT_BRANCH)
  if (match) return match.to
  const timeout = outs.find((e) => e.branch === BUTTON_TIMEOUT_BRANCH)
  return timeout?.to ?? null
}

/** La branche timeout d'un message à boutons (si l'auteur en a défini une). */
export function timeoutTarget(graph: WorkflowGraph, actionNodeId: string): string | null {
  const e = graph.edges.find((x) => x.from === actionNodeId && x.branch === BUTTON_TIMEOUT_BRANCH)
  return e?.to ?? null
}

/** Tire une variante A/B selon les poids (%). Retourne la clé choisie. */
function pickVariant(variants: { key: string; weight: number }[]): string {
  const total = variants.reduce((s, v) => s + Math.max(0, Number(v.weight) || 0), 0)
  if (total <= 0) return variants[0]?.key
  let r = Math.random() * total
  for (const v of variants) {
    r -= Math.max(0, Number(v.weight) || 0)
    if (r < 0) return v.key
  }
  return variants[variants.length - 1].key
}

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
  | { kind: 'send'; templateId: string; nextNodeId: string | null; abTest?: { nodeId: string; variant: string } }
  // Message à boutons : on l'envoie PUIS on parque le job jusqu'au clic. La
  // reprise (resumeFromButton) est pilotée par le webhook, pas par le cron.
  | { kind: 'send_wait_click'; templateId: string; nodeId: string; abTest?: { nodeId: string; variant: string } }
  | { kind: 'wait'; minutes: number; nextNodeId: string }
  | { kind: 'done' }

/** Vrai si le nœud action a des sorties « bouton » (donc funnel à clic). */
export function actionHasButtons(graph: WorkflowGraph, actionNodeId: string): boolean {
  return graph.edges.some((e) => e.from === actionNodeId && isButtonBranch(e.branch))
}

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
  let pendingAb: { nodeId: string; variant: string } | undefined
  while (nodeId && guard++ < 200) {
    const node = findNode(graph, nodeId)
    if (!node) return { kind: 'done' }

    if (node.type === 'ab_test') {
      // Tire une variante selon les poids, puis suit la branche variant:<key>.
      const variant = pickVariant(node.variants || [])
      pendingAb = { nodeId: node.id, variant }
      nodeId = nextNodes(graph, node.id, variantBranch(variant))[0]
      continue
    }

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
      // Message À BOUTONS : on envoie et on PARQUE (reprise sur clic via webhook).
      if (actionHasButtons(graph, node.id)) {
        return { kind: 'send_wait_click', templateId: node.templateId, nodeId: node.id, abTest: pendingAb }
      }
      const next = nextNodes(graph, node.id)[0] || null
      return { kind: 'send', templateId: node.templateId, nextNodeId: next, abTest: pendingAb }
    }

    // trigger ou type inconnu → avancer
    nodeId = nextNodes(graph, node.id)[0]
  }

  return { kind: 'done' }
}
