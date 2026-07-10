'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  applyNodeChanges,
  type Node, type Edge, type NodeChange, type Connection, type NodeProps,
} from '@xyflow/react'
import { Plus, Trash2, Clock, GitBranch, MessageSquare, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsAppTemplate } from '@/types/database'
import {
  type WorkflowGraph, type WorkflowNode, type NodeType,
  isButtonBranch,
} from '@/lib/automations/graph-types'
import { flowNodeTypes, type FlowNodeData } from './flow-nodes'
import { NodeEditorPanel } from './flow-node-editor'

/**
 * Canvas HORIZONTAL (React Flow) du builder de CAMPAGNES marketing.
 *
 * Source de vérité = le WorkflowGraph métier (nodes/edges/positions). React Flow
 * n'est qu'une projection : on convertit graph→RF pour l'affichage, et chaque
 * interaction (drag de position, tracé d'un lien, patch d'un nœud) réécrit le
 * graph via onChange. Le moteur/cron restent inchangés.
 */

let idSeq = 0
function newId(kind: NodeType): string {
  idSeq += 1
  return `${kind}_${Date.now().toString(36)}_${idSeq}`
}

// Positions par défaut si le graphe n'en a pas (chaîne horizontale simple).
function autoLayout(graph: WorkflowGraph): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {}
  const order: string[] = []
  const trig = graph.nodes.find((n) => n.type === 'trigger')
  const seen = new Set<string>()
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id); order.push(id)
    graph.edges.filter((e) => e.from === id).forEach((e) => walk(e.to))
  }
  if (trig) walk(trig.id)
  graph.nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n.id) })
  order.forEach((id, i) => { pos[id] = { x: 80 + i * 300, y: 120 + (i % 2) * 40 } })
  return pos
}

export function FlowCanvas({
  graph, templates, onChange,
}: {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  onChange: (g: WorkflowGraph) => void
  automationId?: string | null
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const positions = useMemo(() => graph.positions && Object.keys(graph.positions).length
    ? graph.positions
    : autoLayout(graph), [graph])

  // graph → React Flow nodes
  const rfNodes: Node[] = useMemo(() => graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: positions[n.id] || { x: 100, y: 100 },
    data: { node: n, templates } as FlowNodeData,
    selected: n.id === selectedId,
  })), [graph.nodes, positions, templates, selectedId])

  // graph → React Flow edges. sourceHandle = la branche (pour retrouver quel
  // bouton/quelle sortie est relié).
  const rfEdges: Edge[] = useMemo(() => graph.edges.map((e, i) => ({
    id: `e${i}_${e.from}_${e.to}_${e.branch || ''}`,
    source: e.from,
    target: e.to,
    sourceHandle: e.branch || undefined,
    animated: isButtonBranch(e.branch),
    label: isButtonBranch(e.branch) ? undefined : e.branch,
    style: { stroke: isButtonBranch(e.branch) ? '#25d366' : 'rgba(255,255,255,0.35)' },
  })), [graph.edges])

  // Drag de position → réécrit graph.positions.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, rfNodes)
    const newPositions: Record<string, { x: number; y: number }> = {}
    next.forEach((n) => { newPositions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) } })
    // On ne persiste QUE les positions (les nodes/edges métier ne changent pas ici).
    onChange({ ...graph, positions: { ...positions, ...newPositions } })
  }, [rfNodes, graph, positions, onChange])

  // Tracé d'un lien → ajoute une WorkflowEdge. La branche vient du handle source.
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return
    const branch = c.sourceHandle || undefined
    // Une sortie ne part qu'une fois : on remplace l'edge existante de ce
    // (from, branch) au lieu d'en empiler plusieurs.
    const edges = graph.edges.filter((e) => !(e.from === c.source && (e.branch || undefined) === branch))
    edges.push({ from: c.source, to: c.target, branch })
    onChange({ ...graph, edges })
  }, [graph, onChange])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const rm = new Set(deleted.map((e) => `${e.source}|${e.target}|${e.sourceHandle || ''}`))
    onChange({ ...graph, edges: graph.edges.filter((e) => !rm.has(`${e.from}|${e.to}|${e.branch || ''}`)) })
  }, [graph, onChange])

  // Ajout d'un nœud depuis la palette : nœud isolé, l'utilisateur tire le lien.
  const addNode = useCallback((kind: Exclude<NodeType, 'trigger'>) => {
    const id = newId(kind)
    let node: WorkflowNode
    if (kind === 'delay') node = { id, type: 'delay', minutes: 60 }
    else if (kind === 'condition') node = { id, type: 'condition', rule: { field: 'order_total', op: '>', value: 50 } }
    else if (kind === 'ab_test') node = { id, type: 'ab_test', variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50 }] }
    else node = { id, type: 'action', templateId: null }
    const lastX = Math.max(0, ...Object.values(positions).map((p) => p.x))
    onChange({
      ...graph,
      nodes: [...graph.nodes, node],
      positions: { ...positions, [id]: { x: lastX + 300, y: 140 } },
    })
    setSelectedId(id)
  }, [graph, positions, onChange])

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) || null

  const patchNode = useCallback((id: string, patch: Partial<WorkflowNode>) => {
    onChange({ ...graph, nodes: graph.nodes.map((n) => n.id === id ? { ...n, ...patch } as WorkflowNode : n) })
  }, [graph, onChange])

  const removeNode = useCallback((id: string) => {
    onChange({
      ...graph,
      nodes: graph.nodes.filter((n) => n.id !== id),
      edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
    })
    setSelectedId(null)
  }, [graph, onChange])

  return (
    // h-full ne suffit pas si un ancêtre n'a pas de hauteur résolue → on force
    // une hauteur minimale pour que React Flow ait une surface à peindre
    // (sinon il rend 0px = canvas vide).
    <div className="relative h-full min-h-[70vh] w-full">
      {/* Palette d'ajout (haut gauche). */}
      <div className="absolute left-3 top-3 z-10 flex gap-1.5 rounded-xl border border-white/10 bg-[#0e1626]/90 p-1.5 backdrop-blur">
        <PaletteBtn icon={MessageSquare} label="Message" onClick={() => addNode('action')} />
        <PaletteBtn icon={Clock} label="Délai" onClick={() => addNode('delay')} />
        <PaletteBtn icon={GitBranch} label="Condition" onClick={() => addNode('condition')} />
        <PaletteBtn icon={FlaskConical} label="A/B" onClick={() => addNode('ab_test')} />
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={flowNodeTypes as unknown as Record<string, React.ComponentType<NodeProps>>}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, n) => setSelectedId(n.id)}
        onPaneClick={() => setSelectedId(null)}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        style={{ width: '100%', height: '100%' }}
        className="bg-[#0a0f1e]"
      >
        <Background color="#1e2a44" gap={20} />
        <Controls className="!bg-[#0e1626] !border-white/10" />
        <MiniMap className="!bg-[#0e1626]" maskColor="rgba(10,15,30,0.7)" nodeColor="#25d366" />
      </ReactFlow>

      {/* Panneau d'édition du nœud sélectionné (droite). */}
      {selectedNode && (
        <div className="absolute right-3 top-3 bottom-3 z-10 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#0e1626]/95 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Édition</span>
            {selectedNode.type !== 'trigger' && (
              <button onClick={() => removeNode(selectedNode.id)} title="Supprimer" className="rounded p-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <NodeEditorPanel node={selectedNode} templates={templates} onPatch={patchNode} />
        </div>
      )}
    </div>
  )
}

function PaletteBtn({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`Ajouter : ${label}`}
      className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white')}>
      <Plus className="h-3.5 w-3.5" /> <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
