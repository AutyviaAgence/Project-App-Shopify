'use client'

import { useState } from 'react'
import type { AIAgent } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Plus, Bot, Loader2, Power, PowerOff, Trash2,
  ChevronRight, Zap, Search, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

const TEMPLATES = [
  { id: 'support', icon: '🎧', name: 'Support client', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  { id: 'booking', icon: '📅', name: 'Prise de RDV', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30' },
  { id: 'leads', icon: '🎯', name: 'Qualification', color: 'bg-violet-500/10 text-violet-600 border-violet-500/30' },
  { id: 'sales', icon: '🛍️', name: 'Vente', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
]

const TONES = [
  { id: 'professional', label: 'Professionnel', emoji: '👔' },
  { id: 'friendly', label: 'Chaleureux', emoji: '😊' },
  { id: 'casual', label: 'Décontracté', emoji: '😎' },
]

interface AgentsPanelProps {
  agents: AIAgent[]
  selectedAgentId: string | null
  onSelectAgent: (agent: AIAgent) => void
  onAgentsChange: () => void
}

export function AgentsPanel({ agents, selectedAgentId, onSelectAgent, onAgentsChange }: AgentsPanelProps) {
  const [search, setSearch] = useState('')
  const [slideOpen, setSlideOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form création
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('professional')
  const [creating, setCreating] = useState(false)

  const filtered = agents.filter(a =>
    search === '' || a.name.toLowerCase().includes(search.toLowerCase())
  )

  function openSlide() {
    setStep(1); setSelectedTemplate(null); setCompanyName(''); setAgentName(''); setTone('professional')
    setSlideOpen(true)
  }

  async function handleCreate() {
    if (!selectedTemplate || !companyName.trim()) return
    setCreating(true)
    try {
      const template = TEMPLATES.find(t => t.id === selectedTemplate)
      const toneLabel = TONES.find(t => t.id === tone)?.label.toLowerCase() || 'professionnel'
      const systemPrompt = `Tu représentes "${companyName}". Adopte un ton ${toneLabel}. ${getDefaultPrompt(selectedTemplate)}`

      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName || `Agent ${template?.name}`,
          description: template?.name,
          system_prompt: systemPrompt,
          model: 'gpt-4o-mini',
          temperature: 0.7,
          is_active: true,
        }),
      })
      if (!agentRes.ok) throw new Error()
      const { data: agent } = await agentRes.json()

      // Appliquer template workflow
      const mod = await import(`@/lib/workflow-templates/${selectedTemplate}`)
      const wf = mod[`${selectedTemplate}Template`]
      await fetch(`/api/agents/${agent.id}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: wf.nodes, edges: wf.edges }),
      })

      toast.success('Agent créé !')
      setSlideOpen(false)
      onAgentsChange()
    } catch {
      toast.error('Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(agent: AIAgent, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    })
    if (res.ok) {
      toast.success(agent.is_active ? 'Agent désactivé' : 'Agent activé')
      onAgentsChange()
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await fetch(`/api/agents/${deleteId}`, { method: 'DELETE' })
    setDeleting(false); setDeleteId(null)
    onAgentsChange()
    toast.success('Agent supprimé')
  }

  return (
    <>
      <div className="w-64 flex-shrink-0 flex flex-col h-full bg-muted/20">
        {/* Header */}
        <div className="px-3 py-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agents IA</p>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={openSlide}>
              <Plus className="h-3 w-3 mr-1" /> Nouveau
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Liste agents */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-3">
              <Bot className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Aucun agent encore</p>
              <button onClick={openSlide} className="text-xs text-primary underline underline-offset-2 mt-1">Créer un agent</button>
            </div>
          ) : filtered.map(agent => (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              className={cn(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-all',
                selectedAgentId === agent.id
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted border border-transparent'
              )}
            >
              <div className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm',
                selectedAgentId === agent.id ? 'bg-primary/20' : 'bg-muted'
              )}>
                {getTemplateIcon(agent.description)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{agent.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                  <span className="text-[10px] text-muted-foreground">{agent.is_active ? 'Actif' : 'Inactif'}</span>
                </div>
              </div>
              {/* Actions au survol */}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => handleToggleActive(agent, e)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                  title={agent.is_active ? 'Désactiver' : 'Activer'}
                >
                  {agent.is_active
                    ? <PowerOff className="h-3 w-3 text-muted-foreground" />
                    : <Power className="h-3 w-3 text-emerald-500" />
                  }
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteId(agent.id) }}
                  className="rounded p-1 hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
              {selectedAgentId === agent.id && (
                <ChevronRight className="h-3 w-3 text-primary shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over création agent */}
      {slideOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSlideOpen(false)} />
          <div className="fixed left-64 top-0 bottom-0 z-50 w-80 bg-background border-r shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Nouvel agent</p>
              <button onClick={() => setSlideOpen(false)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {step === 1 && (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Type d&apos;agent</p>
                    <div className="grid grid-cols-2 gap-2">
                      {TEMPLATES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTemplate(t.id)}
                          className={cn(
                            'rounded-xl border-2 p-3 text-left transition-all',
                            selectedTemplate === t.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                          )}
                        >
                          <span className="text-xl block">{t.icon}</span>
                          <p className="text-xs font-medium mt-1 leading-tight">{t.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!selectedTemplate}
                    onClick={() => setStep(2)}
                  >
                    Continuer <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === 2 && (
                <>
                  <button onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    ← Retour
                  </button>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nom de l&apos;entreprise <span className="text-destructive">*</span></Label>
                      <Input
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        placeholder="Ex: Boulangerie Martin"
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nom de l&apos;agent (optionnel)</Label>
                      <Input
                        value={agentName}
                        onChange={e => setAgentName(e.target.value)}
                        placeholder={`Agent ${TEMPLATES.find(t => t.id === selectedTemplate)?.name}`}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ton</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {TONES.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setTone(t.id)}
                            className={cn(
                              'rounded-lg border py-2 text-center transition-all text-xs',
                              tone === t.id ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'
                            )}
                          >
                            <span className="block text-base">{t.emoji}</span>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={creating || !companyName.trim()}
                  >
                    {creating
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création...</>
                      : <><Zap className="mr-2 h-4 w-4" /> Créer l&apos;agent</>
                    }
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={o => { if (!o) setDeleteId(null) }}
        onConfirm={handleDelete}
        title="Supprimer l'agent"
        description="Le workflow associé sera également supprimé."
        loading={deleting}
      />
    </>
  )
}

function getDefaultPrompt(templateId: string): string {
  const prompts: Record<string, string> = {
    support: 'Tu es un agent de support client professionnel. Réponds aux questions clairement et propose de transférer à un humain si nécessaire.',
    booking: 'Tu es un assistant de prise de rendez-vous. Guide le client vers une réservation rapidement.',
    leads: 'Tu es un agent de qualification. Identifie le besoin, le budget et le délai du prospect en 3-4 questions naturelles.',
    sales: 'Tu es un conseiller commercial enthousiaste. Aide les clients à trouver le produit parfait et guide vers l\'achat.',
  }
  return prompts[templateId] || ''
}

function getTemplateIcon(description: string | null): string {
  const icons: Record<string, string> = {
    'Support client': '🎧', 'Prise de RDV': '📅',
    'Qualification': '🎯', 'Vente': '🛍️',
  }
  return icons[description || ''] || '🤖'
}
