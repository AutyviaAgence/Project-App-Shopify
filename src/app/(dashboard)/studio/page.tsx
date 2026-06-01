'use client'

import { useEffect, useState, useCallback } from 'react'
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas'
import { AgentsPanel } from '@/components/studio/AgentsPanel'
import { AgentConfigPanel } from '@/components/studio/AgentConfigPanel'
import { ResourcesPanel } from '@/components/studio/ResourcesPanel'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import type { AIAgent } from '@/types/database'
import type { WorkflowNode, WorkflowEdge } from '@/lib/workflow/types'
import { Loader2, Bot, GitBranch, Zap } from 'lucide-react'
import { toast } from 'sonner'

export default function StudioPage() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null)
  const [configAgent, setConfigAgent] = useState<AIAgent | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([])
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([])
  const [loadingWorkflow, setLoadingWorkflow] = useState(false)
  const [workflowKey, setWorkflowKey] = useState(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAgents = useCallback(async () => {
    const res = await fetch('/api/agents')
    const json = await res.json()
    const list: AIAgent[] = json.data || []
    setAgents(list)
    if (list.length > 0 && !selectedAgent) {
      selectAgent(list[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  async function selectAgent(agent: AIAgent) {
    setSelectedAgent(agent)
    setLoadingWorkflow(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}/workflow`)
      const json = await res.json()
      setWorkflowNodes(json.data?.nodes || [])
      setWorkflowEdges(json.data?.edges || [])
      setWorkflowKey(k => k + 1)
    } finally {
      setLoadingWorkflow(false)
    }
  }

  async function handleDeleteAgent() {
    if (!deleteId) return
    setDeleting(true)
    await fetch(`/api/agents/${deleteId}`, { method: 'DELETE' })
    setDeleting(false)
    setDeleteId(null)
    if (selectedAgent?.id === deleteId) setSelectedAgent(null)
    if (configAgent?.id === deleteId) setConfigAgent(null)
    fetchAgents()
    toast.success('Agent supprimé')
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panneau gauche — Agents */}
      <AgentsPanel
        agents={agents}
        selectedAgentId={selectedAgent?.id || null}
        configAgentId={configAgent?.id || null}
        onSelectAgent={selectAgent}
        onConfigAgent={agent => setConfigAgent(agent)}
        onAgentsChange={fetchAgents}
      />

      {/* Panneau config agent (si ouvert) */}
      {configAgent && (
        <AgentConfigPanel
          agent={configAgent}
          onClose={() => setConfigAgent(null)}
          onUpdate={updated => {
            setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
            setConfigAgent(updated)
            if (selectedAgent?.id === updated.id) setSelectedAgent(updated)
          }}
          onDelete={() => { setDeleteId(configAgent.id) }}
        />
      )}

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={o => { if (!o) setDeleteId(null) }}
        onConfirm={handleDeleteAgent}
        title="Supprimer l'agent"
        description="Le workflow associé sera également supprimé."
        loading={deleting}
      />

      {/* Centre — Canvas workflow */}
      <div className="flex-1 flex flex-col overflow-hidden border-x">
        {/* Header canvas */}
        <div className="flex items-center gap-3 border-b px-4 py-2.5 bg-background flex-shrink-0">
          {selectedAgent ? (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none truncate">{selectedAgent.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />
                  Workflow
                  {selectedAgent.is_active && (
                    <span className="flex items-center gap-0.5 text-emerald-500 ml-1">
                      <Zap className="h-2.5 w-2.5" /> Actif
                    </span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sélectionnez un agent pour voir son workflow</p>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative">
          {loadingWorkflow && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {selectedAgent ? (
            <WorkflowCanvas
              key={workflowKey}
              agentId={selectedAgent.id}
              initialNodes={workflowNodes}
              initialEdges={workflowEdges}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <GitBranch className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Aucun agent sélectionné</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Créez ou sélectionnez un agent dans le panneau gauche pour éditer son workflow.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Panneau droit — Biblio + Portails */}
      <ResourcesPanel agentId={selectedAgent?.id || null} />
    </div>
  )
}
