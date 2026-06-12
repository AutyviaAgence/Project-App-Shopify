'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, type Node, type Edge, type Connection, type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Clock, GitBranch, MessageSquare, Plus } from 'lucide-react'
import { nodeTypes } from './nodes'
import { graphToFlow, flowToGraph } from './convert'
import type { WorkflowGraph } from '@/lib/automations/graph-types'

/**
 * Canvas du Visual Builder (React Flow). Gère le drag, les connexions (dont les
 * branches Oui/Non des conditions), l'ajout/suppression de nœuds. Remonte le
 * graphe au parent (onChange) et le nœud sélectionné (onSelect).
 */
export function WorkflowCanvas({
  graph,
  templateName,
  onChange,
  onSelect,
}: {
  graph: WorkflowGraph
  templateName: (id: string | null) => string | undefined
  onChange: (g: WorkflowGraph) => void
  onSelect: (nodeId: string | null) => void
}) {
  // id incrémental basé sur le timestamp d'init (Date.now interdit dans render → ok ici, event handler)
  const handleDelete = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initial = useMemo(() => graphToFlow(graph, templateName, handleDelete), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  // Synchronise les DATA des nœuds quand le graphe change de l'extérieur
  // (panneau de config) — sans toucher aux positions gérées par le canvas.
  const skipSync = useRef(false)
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    setNodes((nds) => nds.map((n) => {
      const g = graph.nodes.find((x) => x.id === n.id)
      if (!g) return n
      const data: Record<string, unknown> = { ...n.data }
      if (g.type === 'trigger') data.event = g.event
      if (g.type === 'delay') data.minutes = g.minutes
      if (g.type === 'condition') data.rule = g.rule
      if (g.type === 'action') { data.templateId = g.templateId; data.templateName = templateName(g.templateId) }
      return { ...n, data }
    }))
  }, [graph, setNodes, templateName])

  // Remonte le graphe à chaque changement structurel. On marque skipSync pour
  // que l'effet de synchro ne réécrase pas ce qu'on vient d'émettre.
  const emit = useCallback((n: Node[], e: Edge[]) => { skipSync.current = true; onChange(flowToGraph(n, e)) }, [onChange])

  const onConnect: OnConnect = useCallback((conn: Connection) => {
    setEdges((eds) => {
      // 1 seule sortie par handle (on retire une éventuelle arête existante du même handle)
      const filtered = eds.filter((e) => !(e.source === conn.source && e.sourceHandle === conn.sourceHandle))
      const branch = conn.sourceHandle === 'yes' || conn.sourceHandle === 'no' ? conn.sourceHandle : undefined
      const next = addEdge(
        { ...conn, animated: true, style: { stroke: branch === 'yes' ? '#22C55E' : branch === 'no' ? '#EF4444' : '#94A3B8', strokeWidth: 2 } },
        filtered,
      )
      queueMicrotask(() => emit(nodes, next))
      return next
    })
  }, [nodes, emit, setEdges])

  function addNode(type: 'delay' | 'condition' | 'action') {
    const id = `n_${nodes.length + 1}_${Math.floor(performance.now())}`
    const last = nodes[nodes.length - 1]
    const position = { x: (last?.position.x ?? 60) + 30, y: (last?.position.y ?? 0) + 160 }
    const data: Record<string, unknown> = { onDelete: handleDelete }
    if (type === 'delay') data.minutes = 60
    if (type === 'condition') data.rule = { field: 'order_total', op: '>', value: 50 }
    if (type === 'action') { data.templateId = null; data.templateName = undefined }
    const node: Node = { id, type, position, data }
    setNodes((nds) => { const next = [...nds, node]; queueMicrotask(() => emit(next, edges)); return next })
  }

  return (
    <div className="relative h-full w-full">
      {/* Barre d'ajout */}
      <div className="absolute left-3 top-3 z-10 flex gap-1.5 rounded-xl border bg-card/90 p-1.5 shadow-sm backdrop-blur">
        <button onClick={() => addNode('delay')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/10"><Clock className="h-3.5 w-3.5" />Délai</button>
        <button onClick={() => addNode('condition')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-500/10"><GitBranch className="h-3.5 w-3.5" />Condition</button>
        <button onClick={() => addNode('action')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/10"><MessageSquare className="h-3.5 w-3.5" />Message</button>
        <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground"><Plus className="h-3 w-3" />ajouter</span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(c) => { onNodesChange(c); queueMicrotask(() => emit(nodes, edges)) }}
        onEdgesChange={(c) => { onEdgesChange(c); queueMicrotask(() => emit(nodes, edges)) }}
        onConnect={onConnect}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true }}
      >
        <Background gap={18} size={1} className="opacity-60" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => ({ trigger: '#3B82F6', delay: '#F59E0B', condition: '#8B5CF6', action: '#22C55E' }[n.type || ''] || '#94A3B8')} />
      </ReactFlow>
    </div>
  )
}
