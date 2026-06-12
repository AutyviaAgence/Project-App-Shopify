'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2, Trash2, Workflow, Power, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import type { WhatsAppTemplate } from '@/types/database'
import { WorkflowBuilder } from '@/components/automations/builder/workflow-builder'
import { defaultGraph, validateGraph, triggerNode, type WorkflowGraph } from '@/lib/automations/graph-types'

type Automation = {
  id: string
  name: string
  trigger_event: string
  template_id: string | null
  delay_minutes: number
  is_active: boolean
  graph?: WorkflowGraph | null
  builder_mode?: boolean
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [storeName] = useState('Votre boutique')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Automatisation actuellement ouverte dans le builder (au centre).
  const [current, setCurrent] = useState<Automation | null>(null)
  const [graph, setGraph] = useState<WorkflowGraph | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/automations').then((r) => r.json()),
        fetch('/api/templates').then((r) => r.json()),
      ])
      const autos: Automation[] = aRes.data || []
      setAutomations(autos)
      setTemplates((tRes.data || []).filter((t: WhatsAppTemplate) => t.status === 'approved'))
      // Ouvre la 1re automatisation par défaut (ou rien).
      setCurrent((c) => c || autos[0] || null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Quand l'automatisation courante change, (re)charge son graphe + nom.
  useEffect(() => {
    if (!current) { setGraph(null); setNameDraft(''); return }
    setGraph(current.graph || defaultGraph((current.trigger_event as never) || 'order_fulfilled', current.template_id))
    setNameDraft(current.name || '')
  }, [current])

  function openNew() {
    setCurrent({ id: '', name: '', trigger_event: 'order_fulfilled', template_id: null, delay_minutes: 0, is_active: true })
  }
  function selectAuto(a: Automation) { setCurrent(a) }

  async function toggleActive(a: Automation) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !a.is_active }),
      })
      if (!res.ok) throw new Error()
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x))
      if (current?.id === a.id) setCurrent({ ...a, is_active: !a.is_active })
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  async function remove(a: Automation) {
    if (!a.id) { setCurrent(automations[0] || null); return }
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const next = automations.filter((x) => x.id !== a.id)
      setAutomations(next)
      if (current?.id === a.id) setCurrent(next[0] || null)
      toast.success('Automatisation supprimée')
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  async function save() {
    if (!current || !graph) return
    if (!nameDraft.trim()) { toast.error('Donnez un nom à l’automatisation'); return }
    const errors = validateGraph(graph)
    if (errors.length) { toast.error(errors[0]); return }
    setBusyId('save')
    try {
      const isNew = !current.id
      const trig = triggerNode(graph)
      const res = await fetch(isNew ? '/api/automations' : `/api/automations/${current.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameDraft.trim(),
          trigger_event: trig?.event || current.trigger_event,
          graph, builder_mode: true, is_active: current.is_active,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await load()
      if (json.data?.id) setCurrent(json.data as Automation)
      toast.success('Workflow enregistré')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setBusyId(null) }
  }

  if (loading) return <BlobLoaderScreen />

  return (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Workflow className="h-5 w-5" /> Automatisations</h1>
          <p className="text-xs text-muted-foreground">Construisez un parcours : événement → délai → condition → message.</p>
        </div>
        {current && (
          <div className="flex items-center gap-2">
            {current.id && (
              <button
                onClick={() => toggleActive(current)} disabled={busyId === current.id}
                className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  current.is_active ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground')}
              >
                <Power className="h-3 w-3" />{current.is_active ? 'Actif' : 'Inactif'}
              </button>
            )}
            <Button onClick={save} disabled={busyId === 'save'}>
              {busyId === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        )}
      </div>

      {/* 3 colonnes : sidebar | timeline | iPhone — tout sur la même page */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_1fr]">
        {/* Sidebar : liste des workflows */}
        <aside className="hidden flex-col overflow-y-auto border-r bg-muted/20 p-2 md:flex">
          <button
            onClick={openNew}
            className={cn('mb-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors hover:bg-muted',
              current && !current.id ? 'border-primary text-primary' : 'text-muted-foreground')}
          >
            <Plus className="h-4 w-4" /> Nouveau workflow
          </button>
          {automations.map((a) => (
            <div
              key={a.id}
              onClick={() => selectAuto(a)}
              className={cn('group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                current?.id === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', a.is_active ? 'bg-green-500' : 'bg-muted-foreground/40')} />
              <span className="flex-1 truncate">{a.name || 'Sans nom'}</span>
              <button onClick={(e) => { e.stopPropagation(); remove(a) }} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {automations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun workflow. Créez le premier.</p>
          )}
        </aside>

        {/* Zone centrale : nom + builder timeline + iPhone */}
        {current && graph ? (
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <GitBranch className="h-4 w-4 text-violet-600" />
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Nom du workflow" className="h-8 max-w-xs border-0 bg-transparent px-0 text-sm font-medium focus-visible:ring-0" />
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <WorkflowBuilder graph={graph} templates={templates} storeName={storeName} onChange={setGraph} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <Workflow className="h-10 w-10 opacity-40" />
            <p className="text-sm">Sélectionnez un workflow ou créez-en un.</p>
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nouveau workflow</Button>
          </div>
        )}
      </div>
    </div>
  )
}
