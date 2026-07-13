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
  'id' | 'name' | 'header_text' | 'header_type' | 'body_text' | 'footer_text' | 'buttons'
  | 'template_type' | 'header_media_url' | 'carousel_cards'> & {
  variable_keys?: string[] | null
  sample_values?: string[] | null
}

/** Aperçu d'une carte de carrousel (image + court texte). */
export type SimCard = { image?: string | null; body: string }

/** Un élément affiché dans la conversation simulée. */
export type SimItem =
  | { kind: 'system'; text: string; sub?: string }
  | { kind: 'delay'; label: string; immediate: boolean }
  | {
      kind: 'message'; header?: string; body: string; footer?: string; buttons: string[]; templateName: string
      // Média du template (aperçu) : image/vidéo/doc d'en-tête, ou cartes de carrousel.
      mediaType?: 'none' | 'text' | 'image' | 'video' | 'document'
      mediaUrl?: string | null
      cards?: SimCard[]
    }
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

/** Construit l'item d'affichage `message` d'un nœud action : corps résolu, média
 *  (image/vidéo/doc ou carrousel) et boutons (template ou branches du graphe). */
function buildMessageItem(graph: WorkflowGraph, nodeId: string, t: SimTemplate | undefined): Extract<SimItem, { kind: 'message' }> {
  const tplButtons = quickLabels(t)
  const branchButtons = buttonBranchLabelsOf(graph, nodeId)
  const buttons = tplButtons.length > 0 ? tplButtons : branchButtons
  const samples = samplesOf(t)

  // Carrousel : une carte par produit (image + court texte résolu).
  const isCarousel = t?.template_type === 'carousel'
  const cards: SimCard[] | undefined = isCarousel && Array.isArray(t?.carousel_cards)
    ? (t!.carousel_cards as { header_media_url?: string | null; body_text?: string | null }[])
        .map((c) => ({ image: c.header_media_url || null, body: resolveBody(c.body_text || '', samples) }))
    : undefined

  // En-tête média (image/vidéo/doc) d'un template standard.
  const mediaType = (t?.header_type as 'none' | 'text' | 'image' | 'video' | 'document' | undefined) || 'none'
  const mediaUrl = (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')
    ? (t?.header_media_url || null) : null

  return {
    kind: 'message',
    header: mediaType === 'text' ? (t?.header_text || undefined) : undefined,
    body: resolveBody(t?.body_text || '', samples),
    footer: t?.footer_text || undefined,
    buttons,
    templateName: t?.name || 'Message',
    mediaType,
    mediaUrl,
    cards,
  }
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
      const msg = buildMessageItem(graph, node.id, t)
      items.push(msg)
      // Message à boutons (template OU branches) → on s'arrête et on attend un clic.
      if (msg.buttons.length > 0) {
        return { items, waitingNodeId: node.id, waitingButtons: msg.buttons, done: false }
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

/**
 * MODE AUTO (démo animée) : construit UNE séquence linéaire qui parcourt TOUT le
 * graphe — toutes les routes/boutons l'une après l'autre — pour la faire défiler
 * en boucle sans interaction. À chaque message à boutons, on montre le message,
 * puis pour CHAQUE branche on injecte la réponse cliquée et on continue dans
 * cette branche, avant de passer à la branche suivante.
 *
 * Anti-boucle : un nœud action déjà visité n'est pas re-déroulé (évite les
 * cycles) ; garde globale sur le nombre d'items.
 */
export function buildTour(graph: WorkflowGraph, templates: SimTemplate[]): SimItem[] {
  const items: SimItem[] = []
  const trig = triggerNode(graph)
  if (trig) items.push({ kind: 'system', text: 'Déclencheur : ' + humanTrigger(trig) })
  const start = trig ? nextNodes(graph, trig.id)[0] : undefined

  const visitedActions = new Set<string>()
  let budget = 60 // garde globale (nb d'items max)

  const walk = (fromId: string | undefined, depth: number) => {
    let cur = fromId
    let guard = 0
    while (cur && guard++ < 50 && budget > 0) {
      const node = findNode(graph, cur)
      if (!node) break

      if (node.type === 'delay') {
        const min = node.minutes || 0
        items.push({ kind: 'delay', label: delayLabel(min), immediate: min <= 0 }); budget--
        cur = nextNodes(graph, node.id)[0]; continue
      }
      if (node.type === 'condition') {
        // Démo : on montre les DEUX branches (oui puis non) si elles existent.
        const yes = nextNodes(graph, node.id, 'yes')[0]
        const no = nextNodes(graph, node.id, 'no')[0]
        items.push({ kind: 'system', text: 'Condition', sub: yes && no ? 'branches oui / non' : 'branche évaluée' }); budget--
        if (yes) walk(yes, depth + 1)
        if (no) walk(no, depth + 1)
        return
      }
      if (node.type === 'ab_test') {
        // Démo : dérouler CHAQUE variante l'une après l'autre.
        const variants = node.variants || []
        items.push({ kind: 'system', text: 'Test A/B', sub: `${variants.length} variantes` }); budget--
        for (const v of variants) {
          const target = nextNodes(graph, node.id, `variant:${v.key}`)[0]
          if (target) { items.push({ kind: 'system', text: `Variante ${v.key}`, sub: `${v.weight ?? ''}%` }); budget--; walk(target, depth + 1) }
        }
        return
      }
      if (node.type === 'action') {
        if (visitedActions.has(node.id)) return // anti-cycle
        visitedActions.add(node.id)
        const t = tplOf(node.templateId, templates)
        const msg = buildMessageItem(graph, node.id, t)
        items.push(msg); budget--

        if (msg.buttons.length > 0) {
          // Suite PAR DÉFAUT (branche button:__timeout__) = continuité normale :
          // elle part IMMÉDIATEMENT après le message à boutons.
          const dflt = graph.edges.find((e) => e.from === node.id && e.branch === BUTTON_TIMEOUT_BRANCH)
          if (dflt?.to && budget > 0) walk(dflt.to, depth + 1)

          // PUIS, en plus, chaque bouton cliqué déroule sa branche (démo).
          const outs = graph.edges.filter((e) => e.from === node.id && isButtonBranch(e.branch) && e.branch !== BUTTON_TIMEOUT_BRANCH)
          const norm = (s: string) => s.trim().toLowerCase()
          for (const label of msg.buttons) {
            if (budget <= 0) break
            items.push({ kind: 'reply', text: label }); budget--
            const edge = outs.find((e) => norm(buttonBranchLabel(e.branch) || '') === norm(label))
            if (edge?.to) walk(edge.to, depth + 1)
          }
          return
        }
        cur = nextNodes(graph, node.id)[0]; continue
      }
      cur = nextNodes(graph, node.id)[0]
    }
  }

  walk(start, 0)
  items.push({ kind: 'end', text: 'Fin de la démo' })
  return items
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
