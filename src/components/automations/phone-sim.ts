'use client'

/**
 * Simulateur CLIENT d'un workflow, pour l'aperçu iPhone « Tester l'automatisation ».
 * Rejoue le graphe RÉEL pas à pas — sans aucun appel serveur ni envoi WhatsApp.
 *
 * On n'importe PAS le moteur `graph-engine` (server-only) : on reproduit une
 * navigation minimale du graphe avec les helpers client-safe de graph-types.
 * Le simulateur produit une liste d'ÉVÉNEMENTS d'affichage (bulle système, délai,
 * message, boutons) et s'arrête sur un message à boutons pour attendre un clic.
 */

import {
  findNode, nextNodes, triggerNode, isButtonBranch, buttonBranchLabel,
  BUTTON_TIMEOUT_BRANCH,
  type WorkflowGraph, type WorkflowNode,
} from '@/lib/automations/graph-types'
import type { WhatsAppTemplate, TemplateButton } from '@/types/database'

export type SimTemplate = Pick<WhatsAppTemplate,
  'id' | 'name' | 'header_text' | 'header_type' | 'body_text' | 'footer_text' | 'buttons'> & {
  variable_keys?: string[] | null
  sample_values?: string[] | null
}

/** Un élément affiché dans la conversation simulée. */
export type SimItem =
  | { kind: 'system'; text: string; sub?: string }
  | { kind: 'delay'; label: string; immediate: boolean }
  | { kind: 'message'; header?: string; body: string; footer?: string; buttons: string[]; templateName: string }
  | { kind: 'reply'; text: string }          // réponse du "client" (clic bouton ou texte)
  | { kind: 'end'; text: string }

/** État du simulateur : liste d'items + où on en est dans le graphe. */
export type SimState = {
  items: SimItem[]
  /** node courant en attente (message à boutons) : on attend un clic. null = terminé/idle. */
  waitingNodeId: string | null
  /** boutons proposés par le message en attente (pour l'UI). */
  waitingButtons: string[]
  /** true = le parcours est terminé (plus rien à faire). */
  done: boolean
}

const QUICK = (b: unknown): b is TemplateButton =>
  !!b && typeof b === 'object' && (b as { type?: string }).type === 'QUICK_REPLY'

function quickLabels(t: SimTemplate | undefined): string[] {
  if (!t) return []
  return ((t.buttons ?? []) as TemplateButton[]).filter(QUICK).map((b) => b.text)
}

/** Résout les {{n}} d'un corps avec les exemples (ou « … »). */
function resolveBody(body: string, samples: string[]): string {
  let out = body || ''
  samples.forEach((s, i) => { out = out.replaceAll(`{{${i + 1}}}`, s || '…') })
  return out.replace(/\{\{\s*\d+\s*\}\}/g, '…')
}

/** Libellé humain d'un délai en minutes. */
function delayLabel(min: number): string {
  if (min <= 0) return 'Immédiat'
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} j`
}

function tplOf(templateId: string | null | undefined, templates: SimTemplate[]): SimTemplate | undefined {
  return templateId ? templates.find((t) => t.id === templateId) : undefined
}

/** Libellés des boutons DÉFINIS PAR LES BRANCHES sortantes d'un nœud (edges
 *  `button:<label>`), dans l'ordre des edges, hors branche timeout. Sert de
 *  source de vérité quand le template n'a pas remonté ses QUICK_REPLY. */
function buttonBranchLabelsOf(graph: WorkflowGraph, nodeId: string): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const e of graph.edges) {
    if (e.from !== nodeId || !isButtonBranch(e.branch) || e.branch === BUTTON_TIMEOUT_BRANCH) continue
    const label = buttonBranchLabel(e.branch)
    if (label && !seen.has(label)) { seen.add(label); labels.push(label) }
  }
  return labels
}

function samplesOf(t: SimTemplate | undefined): string[] {
  if (!t) return []
  if (Array.isArray(t.sample_values) && t.sample_values.length) return t.sample_values as string[]
  // Fallback lisible par position (prénom, boutique) si pas d'exemples stockés.
  return ['Marie', 'Ma Boutique', 'https://exemple.com']
}

/**
 * Avance dans le graphe à partir de `fromNodeId` (ou du trigger si null), en
 * accumulant des items d'affichage, JUSQU'À :
 *  - un message à boutons → on s'arrête (waitingNodeId) pour attendre un clic ;
 *  - la fin du parcours → done.
 * Les conditions/A-B sont simulées en prenant la 1re branche (aperçu), le délai
 * est juste affiché (raccourci à l'écran).
 */
export function advance(
  graph: WorkflowGraph,
  templates: SimTemplate[],
  fromNodeId: string | null,
  base: SimItem[],
): SimState {
  const items = [...base]
  let cur: string | undefined
  if (fromNodeId) cur = fromNodeId
  else {
    const trig = triggerNode(graph)
    // Bulle système d'ouverture (l'événement déclencheur).
    if (trig) items.push({ kind: 'system', text: 'Déclencheur : ' + humanTrigger(trig) })
    cur = trig ? nextNodes(graph, trig.id)[0] : undefined
  }

  let guard = 0
  while (cur && guard++ < 100) {
    const node = findNode(graph, cur)
    if (!node) break

    if (node.type === 'delay') {
      const min = node.minutes || 0
      items.push({ kind: 'delay', label: delayLabel(min), immediate: min <= 0 })
      cur = nextNodes(graph, node.id)[0]
      continue
    }
    if (node.type === 'condition') {
      // Aperçu : on suit la branche « oui ».
      items.push({ kind: 'system', text: 'Condition évaluée', sub: 'branche « oui » (aperçu)' })
      cur = nextNodes(graph, node.id, 'yes')[0] || nextNodes(graph, node.id)[0]
      continue
    }
    if (node.type === 'ab_test') {
      const first = node.variants?.[0]?.key
      items.push({ kind: 'system', text: 'Test A/B', sub: `variante ${first || 'A'} (aperçu)` })
      cur = nextNodes(graph, node.id, `variant:${first}`)[0]
      continue
    }
    if (node.type === 'action') {
      const t = tplOf(node.templateId, templates)
      // Boutons proposés = ceux du template SI présents, sinon on les DÉDUIT des
      // branches `button:` sortantes du nœud (source de vérité du parcours). Sans
      // ce fallback, un nœud dont le template n'a pas remonté ses QUICK_REPLY
      // n'attendait pas le clic et le parcours « sautait » les routes.
      const tplButtons = quickLabels(t)
      const branchButtons = buttonBranchLabelsOf(graph, node.id)
      const buttons = tplButtons.length > 0 ? tplButtons : branchButtons
      items.push({
        kind: 'message',
        header: t?.header_type === 'text' ? (t?.header_text || undefined) : undefined,
        body: resolveBody(t?.body_text || '', samplesOf(t)),
        footer: t?.footer_text || undefined,
        buttons,
        templateName: t?.name || 'Message',
      })
      // Message à boutons (template OU branches) → on s'arrête et on attend un clic.
      if (buttons.length > 0) {
        return { items, waitingNodeId: node.id, waitingButtons: buttons, done: false }
      }
      // Sinon on continue tout droit (1re sortie, branche indifférente).
      cur = nextNodes(graph, node.id)[0]
      continue
    }
    // type inconnu → avance
    cur = nextNodes(graph, node.id)[0]
  }

  items.push({ kind: 'end', text: 'Fin du parcours' })
  return { items, waitingNodeId: null, waitingButtons: [], done: true }
}

/** Reprend le parcours après un clic de bouton sur le message en attente. */
export function clickButton(
  graph: WorkflowGraph,
  templates: SimTemplate[],
  state: SimState,
  clickedLabel: string,
): SimState {
  if (!state.waitingNodeId) return state
  const nodeId = state.waitingNodeId
  const outs = graph.edges.filter((e) => e.from === nodeId && isButtonBranch(e.branch))
  const norm = (s: string) => s.trim().toLowerCase()
  const match = outs.find((e) => norm(buttonBranchLabel(e.branch) || '') === norm(clickedLabel) && e.branch !== BUTTON_TIMEOUT_BRANCH)
  const target = match?.to || outs.find((e) => e.branch === BUTTON_TIMEOUT_BRANCH)?.to || null
  // Ajoute la "réponse" du client (le libellé cliqué) puis avance.
  const withReply: SimItem[] = [...state.items, { kind: 'reply', text: clickedLabel }]
  if (!target) {
    return { items: [...withReply, { kind: 'end', text: 'Aucune suite pour ce bouton' }], waitingNodeId: null, waitingButtons: [], done: true }
  }
  return advance(graph, templates, target, withReply)
}

/** Le contact tape un message libre : on l'affiche puis on reprend depuis le
 *  node en attente sur la branche « sans réponse » (timeout) si elle existe,
 *  sinon on termine (un texte libre ne matche aucun bouton). */
export function typeText(
  graph: WorkflowGraph,
  templates: SimTemplate[],
  state: SimState,
  text: string,
): SimState {
  const withReply: SimItem[] = [...state.items, { kind: 'reply', text }]
  if (!state.waitingNodeId) {
    return { ...state, items: withReply }
  }
  const timeout = graph.edges.find((e) => e.from === state.waitingNodeId && e.branch === BUTTON_TIMEOUT_BRANCH)
  if (timeout) return advance(graph, templates, timeout.to, withReply)
  return { items: [...withReply, { kind: 'end', text: 'En attente d’un clic sur un bouton' }], waitingNodeId: state.waitingNodeId, waitingButtons: state.waitingButtons, done: false }
}

/** Démarre une nouvelle simulation depuis le trigger. */
export function startSim(graph: WorkflowGraph, templates: SimTemplate[]): SimState {
  return advance(graph, templates, null, [])
}

// ---- libellés triggers (aperçu) --------------------------------------------
function humanTrigger(trig: WorkflowNode): string {
  if (trig.type !== 'trigger') return 'événement'
  const map: Record<string, string> = {
    order_created: 'Commande créée', order_paid: 'Commande payée', order_fulfilled: 'Commande expédiée',
    order_delivered: 'Commande livrée', order_cancelled: 'Commande annulée', checkout_abandoned: 'Panier abandonné',
    contact_opted_in: 'Nouvel abonné', optin_popup: 'Opt-in via popup', button_clicked: 'Clic sur un bouton',
    scheduled_date: 'Date précise', customer_birthday: 'Anniversaire client',
  }
  return map[trig.event] || trig.event
}
