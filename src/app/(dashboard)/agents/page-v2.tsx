'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { AgentTestChat } from '@/components/agent-test-chat'
import {
  Plus, Bot, Trash2, Loader2, Zap, GitBranch,
  PlayCircle, Copy, MoreVertical, Power, PowerOff, Pin, PinOff,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AIAgent } from '@/types/database'

const TEMPLATE_ICONS: Record<string, string> = {
  support: '🎧',
  booking: '📅',
  leads: '🎯',
  sales: '🛍️',
  qualifier: '🔀',
}

export default function AgentsV2Page() {
  const router = useRouter()
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [testAgent, setTestAgent] = useState<AIAgent | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<Record<string, boolean>>({})

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok) setAgents(json.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  // Vérifier quels agents ont un workflow
  useEffect(() => {
    async function checkWorkflows() {
      const statuses: Record<string, boolean> = {}
      await Promise.all(
        agents.map(async (agent) => {
          try {
            const res = await fetch(`/api/agents/${agent.id}/workflow`)
            const json = await res.json()
            statuses[agent.id] = json.data?.nodes?.length > 0
          } catch {
            statuses[agent.id] = false
          }
        })
      )
      setWorkflowStatus(statuses)
    }
    if (agents.length > 0) checkWorkflows()
  }, [agents])

  async function handleToggleActive(agent: AIAgent) {
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    })
    if (res.ok) {
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a))
      toast.success(agent.is_active ? 'Agent désactivé' : 'Agent activé')
    }
  }

  async function handleTogglePin(agent: AIAgent) {
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !(agent as AIAgent & { is_pinned?: boolean }).is_pinned }),
    })
    if (res.ok) {
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_pinned: !(a as AIAgent & { is_pinned?: boolean }).is_pinned } as AIAgent : a))
    }
  }

  async function handleDuplicate(agent: AIAgent) {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${agent.name} (copie)`,
        description: agent.description,
        system_prompt: agent.system_prompt,
        model: agent.model,
        temperature: agent.temperature,
        is_active: false,
      }),
    })
    if (res.ok) {
      toast.success('Agent dupliqué')
      fetchAgents()
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const res = await fetch(`/api/agents/${deleteId}`, { method: 'DELETE' })
    if (res.ok) {
      setAgents(prev => prev.filter(a => a.id !== deleteId))
      toast.success('Agent supprimé')
    }
    setDeleting(false)
    setDeleteId(null)
  }

  const sortedAgents = [...agents].sort((a, b) => {
    const aPin = (a as AIAgent & { is_pinned?: boolean }).is_pinned ? 1 : 0
    const bPin = (b as AIAgent & { is_pinned?: boolean }).is_pinned ? 1 : 0
    return bPin - aPin
  })

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agents IA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agent{agents.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/welcome-v2">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouvel agent
          </Button>
        </Link>
      </div>

      {/* Grille */}
      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Aucun agent encore</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">Créez votre premier agent IA en quelques minutes avec un template prêt à l&apos;emploi.</p>
            <Link href="/welcome-v2" className="mt-4">
              <Button>
                <Zap className="mr-2 h-4 w-4" />
                Créer mon premier agent
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                hasWorkflow={workflowStatus[agent.id] || false}
                onToggleActive={() => handleToggleActive(agent)}
                onTogglePin={() => handleTogglePin(agent)}
                onDuplicate={() => handleDuplicate(agent)}
                onDelete={() => setDeleteId(agent.id)}
                onTest={() => setTestAgent(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null) }}
        onConfirm={handleDelete}
        title="Supprimer l'agent"
        description="Cette action est irréversible. Le workflow associé sera également supprimé."
        loading={deleting}
      />

      {testAgent && (
        <AgentTestChat
          open={!!testAgent}
          onOpenChange={(o) => { if (!o) setTestAgent(null) }}
          agentId={testAgent.id}
          agentName={testAgent.name}
        />
      )}
    </div>
  )
}

// ─── Card Agent ────────────────────────────────────────────────────────────────

function AgentCard({
  agent, hasWorkflow, onToggleActive, onTogglePin, onDuplicate, onDelete, onTest,
}: {
  agent: AIAgent
  hasWorkflow: boolean
  onToggleActive: () => void
  onTogglePin: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTest: () => void
}) {
  const isPinned = (agent as AIAgent & { is_pinned?: boolean }).is_pinned

  return (
    <div className={cn(
      'group relative rounded-2xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30',
      !agent.is_active && 'opacity-60'
    )}>
      {/* Pin indicator */}
      {isPinned && (
        <div className="absolute top-3 right-3">
          <Pin className="h-3 w-3 text-primary" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
          {TEMPLATE_ICONS[agent.agent_type || ''] || '🤖'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{agent.name}</p>
          {agent.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-[10px] h-5">
          {agent.is_active ? '● Actif' : '○ Inactif'}
        </Badge>
        {hasWorkflow ? (
          <Badge variant="outline" className="text-[10px] h-5 border-violet-500/50 text-violet-600">
            <GitBranch className="mr-1 h-2.5 w-2.5" />
            Workflow
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
            Sans workflow
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
          {agent.model || 'gpt-4o-mini'}
        </Badge>
      </div>

      {/* Actions principales */}
      <div className="flex gap-2">
        <Link href={`/agents/${agent.id}/workflow`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full h-8 text-xs">
            <GitBranch className="mr-1.5 h-3 w-3" />
            {hasWorkflow ? 'Voir le workflow' : 'Créer un workflow'}
          </Button>
        </Link>

        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onTest} title="Tester">
          <PlayCircle className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onToggleActive}>
              {agent.is_active ? <><PowerOff className="mr-2 h-4 w-4" /> Désactiver</> : <><Power className="mr-2 h-4 w-4" /> Activer</>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {isPinned ? <><PinOff className="mr-2 h-4 w-4" /> Désépingler</> : <><Pin className="mr-2 h-4 w-4" /> Épingler</>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Dupliquer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
