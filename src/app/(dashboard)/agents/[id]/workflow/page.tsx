'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Bot, Zap } from 'lucide-react'
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas'
import type { WorkflowNode, WorkflowEdge } from '@/lib/workflow/types'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function WorkflowEditorPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [agent, setAgent] = useState<{ name: string } | null>(null)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<WorkflowEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [agentRes, workflowRes] = await Promise.all([
          fetch(`/api/agents/${id}`),
          fetch(`/api/agents/${id}/workflow`),
        ])

        if (!agentRes.ok) { setError('Agent introuvable'); return }

        const agentJson = await agentRes.json()
        const workflowJson = await workflowRes.json()

        setAgent({ name: agentJson.data?.name || 'Agent' })
        setNodes(workflowJson.data?.nodes || [])
        setEdges(workflowJson.data?.edges || [])
      } catch {
        setError('Erreur de chargement')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.push('/agents')}>
          Retour aux agents
        </Button>
      </div>
    )
  }

  // Si pas de workflow, proposer les templates
  if (nodes.length === 0) {
    return <TemplateSelector agentId={id} agentName={agent?.name || 'Agent'} onSelect={(n, e) => { setNodes(n); setEdges(e) }} />
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 bg-background flex-shrink-0">
        <Link href="/agents">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{agent?.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Éditeur de workflow</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
            <Zap className="h-3 w-3" />
            Actif
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <WorkflowCanvas
          agentId={id}
          initialNodes={nodes}
          initialEdges={edges}
        />
      </div>
    </div>
  )
}

// ─── Sélecteur de template ─────────────────────────────────────────────────────

function TemplateSelector({
  agentId,
  agentName,
  onSelect,
}: {
  agentId: string
  agentName: string
  onSelect: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void
}) {
  const [applying, setApplying] = useState<string | null>(null)

  const templates = [
    { id: 'support', name: 'Support client FAQ', description: 'Répond aux questions fréquentes 24h/24', icon: '🎧', color: 'border-blue-500/30 hover:border-blue-500 bg-blue-500/5' },
    { id: 'booking', name: 'Prise de rendez-vous', description: 'Qualifie et propose un créneau automatiquement', icon: '📅', color: 'border-cyan-500/30 hover:border-cyan-500 bg-cyan-500/5' },
    { id: 'leads', name: 'Qualification de leads', description: 'Identifie et qualifie vos prospects', icon: '🎯', color: 'border-violet-500/30 hover:border-violet-500 bg-violet-500/5' },
    { id: 'sales', name: 'Vente & catalogue', description: 'Présente vos produits et guide vers l\'achat', icon: '🛍️', color: 'border-orange-500/30 hover:border-orange-500 bg-orange-500/5' },
  ]

  async function applyTemplate(templateId: string) {
    setApplying(templateId)
    try {
      const mod = await import(`@/lib/workflow-templates/${templateId}`)
      const template = mod[`${templateId}Template`]
      onSelect(template.nodes, template.edges)
    } catch {
      // fallback vide
      onSelect([], [])
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3 bg-background">
        <Link href="/agents">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <p className="text-sm font-semibold">{agentName} — Créer un workflow</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full text-center space-y-2 mb-8">
          <h1 className="text-2xl font-bold">Choisissez un point de départ</h1>
          <p className="text-muted-foreground">Sélectionnez un template ou commencez avec un canvas vide.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.id)}
              disabled={applying !== null}
              className={`relative rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${t.color} disabled:opacity-50`}
            >
              {applying === t.id && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/50">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              <span className="text-3xl">{t.icon}</span>
              <p className="mt-2 font-semibold text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
            </button>
          ))}
        </div>

        <button
          onClick={() => onSelect(
            [{ id: 'trigger-1', type: 'triggerNode', position: { x: 300, y: 100 }, data: { label: 'Nouveau message', description: 'Déclenché à chaque message entrant' } }],
            []
          )}
          className="mt-6 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Commencer avec un canvas vide →
        </button>
      </div>
    </div>
  )
}
