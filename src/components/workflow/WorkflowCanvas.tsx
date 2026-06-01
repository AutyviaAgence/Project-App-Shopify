'use client'

import { useCallback, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { TriggerNode } from './nodes/TriggerNode'
import { AiNode } from './nodes/AiNode'
import { MessageNode } from './nodes/MessageNode'
import { ConditionNode } from './nodes/ConditionNode'
import { RelanceNode } from './nodes/RelanceNode'
import { EscaladeNode, BookingNode, MediaNode, TagNode, StopNode } from './nodes/OtherNodes'
import { NodeConfigPanel } from './NodeConfigPanel'
import { WorkflowPalette } from './WorkflowPalette'
import { NODE_TYPE_CONFIGS, type WorkflowNode, type WorkflowEdge } from '@/lib/workflow/types'
import { Button } from '@/components/ui/button'
import { Save, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const nodeTypes: NodeTypes = {
  triggerNode: TriggerNode,
  aiNode: AiNode,
  messageNode: MessageNode,
  conditionNode: ConditionNode,
  relanceNode: RelanceNode,
  escaladeNode: EscaladeNode,
  bookingNode: BookingNode,
  mediaNode: MediaNode,
  tagNode: TagNode,
  stopNode: StopNode,
}

interface WorkflowCanvasProps {
  agentId: string
  initialNodes: WorkflowNode[]
  initialEdges: WorkflowEdge[]
  onSave?: () => void
}

export function WorkflowCanvas({ agentId, initialNodes, initialEdges, onSave }: WorkflowCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as any)
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<{ project: (pos: { x: number; y: number }) => { x: number; y: number } } | null>(null)

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds)),
    [setEdges]
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNode(node as WorkflowNode)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Drag & drop depuis la palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow')
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      const config = NODE_TYPE_CONFIGS.find(c => c.type === type)
      const newNode: WorkflowNode = {
        id: `${type}-${Date.now()}`,
        type: type as WorkflowNode['type'],
        position,
        data: getDefaultData(type),
      }

      setNodes((nds) => nds.concat(newNode as never))
    },
    [reactFlowInstance, setNodes]
  )

  // Mise à jour data d'un nœud
  const handleUpdateNode = useCallback((nodeId: string, data: Partial<WorkflowNode['data']>) => {
    setNodes((nds) =>
      nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)
    )
    setSelectedNode((prev) => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } as WorkflowNode : prev)
  }, [setNodes])

  // Suppression d'un nœud
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
  }, [setNodes, setEdges])

  // Sauvegarde
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      })
      if (!res.ok) throw new Error('Erreur sauvegarde')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave?.()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [agentId, nodes, edges, onSave])

  return (
    <div className="flex h-full w-full">
      {/* Palette de blocs */}
      <WorkflowPalette />

      {/* Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 h-full" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={(instance) => setReactFlowInstance(instance as never)}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode="Delete"
          defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-30" />
          <Controls className="shadow-sm" />
          <MiniMap
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                triggerNode: '#10b981',
                aiNode: '#8b5cf6',
                messageNode: '#3b82f6',
                conditionNode: '#eab308',
                relanceNode: '#f59e0b',
                escaladeNode: '#f43f5e',
                bookingNode: '#06b6d4',
                mediaNode: '#f97316',
                tagNode: '#ec4899',
                stopNode: '#64748b',
              }
              return colors[node.type || ''] || '#94a3b8'
            }}
            className="border rounded-lg shadow-sm"
          />

          {/* Bouton Sauvegarder */}
          <Panel position="top-right">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className={cn('shadow-sm', saved && 'bg-emerald-600 hover:bg-emerald-700')}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saved ? 'Sauvegardé !' : 'Sauvegarder'}
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Panneau de configuration du nœud sélectionné */}
      {selectedNode && (
        <div className="w-72 border-l bg-background h-full overflow-hidden flex flex-col">
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNode(null)}
            onDelete={handleDeleteNode}
          />
        </div>
      )}
    </div>
  )
}

// ─── Données par défaut pour chaque type de nœud ──────────────────────────────

function getDefaultData(type: string): WorkflowNode['data'] {
  const defaults: Record<string, WorkflowNode['data']> = {
    triggerNode: { label: 'Nouveau message', description: 'Déclenché à chaque message entrant' },
    aiNode: { label: 'Agent IA', shortPrompt: 'Décris ce que doit faire cet agent...', systemPrompt: '', model: 'gpt-4o-mini', temperature: 0.7, useKnowledge: false },
    messageNode: { label: 'Message', message: 'Votre message ici...' },
    mediaNode: { label: 'Image / Média', imageRef: '', message: '' },
    conditionNode: { label: 'Condition', condition: 'contains', value: '' },
    relanceNode: { label: 'Relance', delayHours: 24, maxRelances: 1, message: 'Bonjour, avez-vous eu le temps de lire mon message ?' },
    escaladeNode: { label: 'Escalade humaine', message: 'Je vous transfère à un conseiller.' },
    bookingNode: { label: 'Rendez-vous', message: 'Réservez un créneau ici :' },
    tagNode: { label: 'Tag contact', tagName: '', action: 'add' },
    stopNode: { label: 'Fin du workflow' },
  }
  return defaults[type] || { label: 'Bloc' }
}
