import type { Node, Edge } from '@xyflow/react'
import type { WorkflowGraph } from '@/lib/automations/graph-types'

/** Position par défaut auto-générée si le graphe n'a pas de positions. */
function autoPosition(index: number): { x: number; y: number } {
  return { x: 60, y: 40 + index * 150 }
}

/** WorkflowGraph → nodes/edges React Flow. */
export function graphToFlow(
  graph: WorkflowGraph,
  templateName: (id: string | null) => string | undefined,
  onDelete: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n, i) => {
    const pos = graph.positions?.[n.id] || autoPosition(i)
    const base = { id: n.id, position: pos, type: n.type }
    if (n.type === 'trigger') return { ...base, data: { event: n.event, onDelete } }
    if (n.type === 'delay') return { ...base, data: { minutes: n.minutes, onDelete } }
    if (n.type === 'condition') return { ...base, data: { rule: n.rule, onDelete } }
    return { ...base, data: { templateId: n.templateId, templateName: templateName(n.templateId), onDelete } }
  })

  const edges: Edge[] = graph.edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    sourceHandle: e.branch ?? undefined,
    animated: true,
    style: { stroke: e.branch === 'yes' ? '#22C55E' : e.branch === 'no' ? '#EF4444' : '#94A3B8', strokeWidth: 2 },
  }))

  return { nodes, edges }
}

/** nodes/edges React Flow → WorkflowGraph (pour sauvegarder). */
export function flowToGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  const positions: Record<string, { x: number; y: number }> = {}
  const gNodes = nodes.map((n) => {
    positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
    const d = n.data as Record<string, unknown>
    switch (n.type) {
      case 'trigger': return { id: n.id, type: 'trigger' as const, event: d.event as never }
      case 'delay': return { id: n.id, type: 'delay' as const, minutes: Number(d.minutes) || 0 }
      case 'condition': return { id: n.id, type: 'condition' as const, rule: d.rule as never }
      default: return { id: n.id, type: 'action' as const, templateId: (d.templateId as string) ?? null }
    }
  })
  const gEdges = edges.map((e) => ({
    from: e.source,
    to: e.target,
    branch: (e.sourceHandle === 'yes' || e.sourceHandle === 'no') ? (e.sourceHandle as 'yes' | 'no') : undefined,
  }))
  return { nodes: gNodes, edges: gEdges, positions }
}
