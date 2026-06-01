'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas'
import { ResourcesPanel } from '@/components/studio/ResourcesPanel'
import type { AIAgent } from '@/types/database'
import type { WorkflowNode, WorkflowEdge } from '@/lib/workflow/types'
import { Loader2, Bot, GitBranch, Zap, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function StudioPage() {
  const searchParams = useSearchParams()
  const agentId = searchParams.get('agent')

  const [agent, setAgent] = useState<AIAgent | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([])
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [workflowKey, setWorkflowKey] = useState(0)

  useEffect(() => {
    if (!agentId) { setLoading(false); return }
    async function load() {
      setLoading(true)
      try {
        const [agentRes, workflowRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`),
          fetch(`/api/agents/${agentId}/workflow`),
        ])
        const [agentJson, workflowJson] = await Promise.all([agentRes.json(), workflowRes.json()])
        setAgent(agentJson.data || null)
        setWorkflowNodes(workflowJson.data?.nodes || [])
        setWorkflowEdges(workflowJson.data?.edges || [])
        setWorkflowKey(k => k + 1)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [agentId])

  if (!agentId) {
    return <NoAgentSelected />
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-2.5 bg-background flex-shrink-0">
          <Link href="/agents">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {agent && (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />
                  Workflow
                  {agent.is_active && (
                    <span className="flex items-center gap-0.5 text-emerald-500 ml-1">
                      <Zap className="h-2.5 w-2.5" /> Actif
                    </span>
                  )}
                </p>
              </div>
            </>
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          {!loading && agentId && (
            <WorkflowCanvas
              key={workflowKey}
              agentId={agentId}
              initialNodes={workflowNodes}
              initialEdges={workflowEdges}
            />
          )}
        </div>
      </div>

      {/* Panneau droit — Biblio + Portails */}
      <ResourcesPanel agentId={agentId} />
    </div>
  )
}

function NoAgentSelected() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(j => {
      setAgents(j.data || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <GitBranch className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Studio Workflow</h2>
        <p className="text-sm text-muted-foreground mt-1">Sélectionnez un agent pour éditer son workflow</p>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {agents.map(a => (
            <Link key={a.id} href={`/studio?agent=${a.id}`}>
              <div className="flex items-center gap-3 rounded-xl border px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${a.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-[10px] text-muted-foreground">{a.is_active ? 'Actif' : 'Inactif'}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {agents.length === 0 && (
            <Link href="/agents">
              <Button className="w-full">Créer un agent</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
