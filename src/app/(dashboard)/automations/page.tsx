'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2, Trash2, Workflow, Power, GitBranch, ChevronLeft, ChevronRight, Folder, FolderPlus, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import type { WhatsAppTemplate } from '@/types/database'
import { WorkflowBuilder } from '@/components/automations/builder/workflow-builder'
import { WorkflowWizard } from '@/components/automations/workflow-wizard'
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
  folder_id?: string | null
}

type Folder = { id: string; name: string; color: string | null; position: number }

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [storeName] = useState('Votre boutique')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  // Dossier survolé pendant un drag (surbrillance) + workflow en cours de drag.
  const [dragOverFolder, setDragOverFolder] = useState<string | null | 'none'>(null)

  // Automatisation actuellement ouverte dans le builder (au centre).
  const [current, setCurrent] = useState<Automation | null>(null)
  const [graph, setGraph] = useState<WorkflowGraph | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const [aRes, tRes, fRes] = await Promise.all([
        fetch('/api/automations').then((r) => r.json()),
        fetch('/api/templates').then((r) => r.json()),
        fetch('/api/automation-folders').then((r) => r.json()),
      ])
      const autos: Automation[] = aRes.data || []
      setAutomations(autos)
      setTemplates((tRes.data || []).filter((t: WhatsAppTemplate) => t.status === 'approved'))
      setFolders(fRes.data || [])
      // Ouvre la 1re automatisation par défaut (ou rien).
      setCurrent((c) => c || autos[0] || null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Créer un dossier (prompt simple pour le nom).
  async function createFolder() {
    const name = window.prompt('Nom du dossier ?')?.trim()
    if (!name) return
    const res = await fetch('/api/automation-folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const json = await res.json()
    if (res.ok && json.data) setFolders((prev) => [...prev, json.data])
    else toast.error(json.error || 'Erreur')
  }

  async function deleteFolder(f: Folder) {
    if (!window.confirm(`Supprimer le dossier « ${f.name} » ? Les workflows dedans repasseront en « Non classés ».`)) return
    const res = await fetch(`/api/automation-folders/${f.id}`, { method: 'DELETE' })
    if (res.ok) {
      setFolders((prev) => prev.filter((x) => x.id !== f.id))
      setAutomations((prev) => prev.map((a) => a.folder_id === f.id ? { ...a, folder_id: null } : a))
    } else toast.error('Erreur')
  }

  // Déplacer un workflow vers un dossier (null = non classés). Optimiste.
  async function moveToFolder(autoId: string, folderId: string | null) {
    setAutomations((prev) => prev.map((a) => a.id === autoId ? { ...a, folder_id: folderId } : a))
    const res = await fetch(`/api/automations/${autoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    })
    if (!res.ok) { toast.error('Déplacement échoué'); load() }
  }

  useEffect(() => { load() }, [load])

  // Quand l'automatisation courante change, (re)charge son graphe + nom.
  useEffect(() => {
    if (!current) { setGraph(null); setNameDraft(''); return }
    setGraph(current.graph || defaultGraph((current.trigger_event as never) || 'order_fulfilled', current.template_id))
    setNameDraft(current.name || '')
  }, [current])

  function openNew() {
    // Création guidée par le wizard (au lieu d'ouvrir directement le builder vide).
    setShowWizard(true)
    setCurrent(null)
  }
  function selectAuto(a: Automation) { setShowWizard(false); setCurrent(a) }

  // Le wizard a fini : on crée l'automatisation AVEC son graphe, puis on l'ouvre
  // dans le builder pour affiner.
  async function onWizardComplete(data: { name: string; graph: WorkflowGraph; trigger: string }) {
    setBusyId('save')
    try {
      const res = await fetch('/api/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, trigger_event: data.trigger, graph: data.graph, builder_mode: true, is_active: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      track('automation_created', { trigger: data.trigger, via: 'wizard' })
      await load()
      setShowWizard(false)
      if (json.data) setCurrent(json.data as Automation)
      toast.success('Automatisation créée — ajustez-la ici.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setBusyId(null) }
  }

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
      if (isNew) track('automation_created', { trigger: trig?.event || undefined })
      if (current.is_active) track('automation_activated', { id: json.data?.id })
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
      <div className={cn('grid min-h-0 flex-1 grid-cols-1', sidebarCollapsed ? 'md:grid-cols-[52px_1fr]' : 'md:grid-cols-[280px_1fr]')}>
        {/* Sidebar repliée : juste + et flèche pour rouvrir */}
        {sidebarCollapsed ? (
          <aside className="hidden flex-col items-center gap-2 border-r bg-muted/20 p-2 md:flex">
            <button onClick={() => setSidebarCollapsed(false)} title="Afficher les workflows"
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-primary">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={openNew} title="Nouveau workflow"
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4" />
            </button>
          </aside>
        ) : (
        <aside className="hidden flex-col overflow-y-auto border-r bg-muted/20 p-2 md:flex">
          {/* En-tête sidebar : titre + flèche replier + bouton + */}
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflows</span>
            <div className="flex items-center gap-1">
              <button onClick={createFolder} title="Nouveau dossier"
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <FolderPlus className="h-4 w-4" />
              </button>
              <button onClick={openNew} title="Nouveau workflow"
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => setSidebarCollapsed(true)} title="Réduire"
                className="flex h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-primary">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
          <button
            onClick={openNew}
            className={cn('mb-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors hover:bg-muted',
              current && !current.id ? 'border-primary text-primary' : 'text-muted-foreground')}
          >
            <Plus className="h-4 w-4" /> Nouveau workflow
          </button>
          {/* Entrée fantôme : brouillon en cours de création (pas encore sauvegardé).
              Donne un retour visuel immédiat au clic sur « + Nouveau workflow ». */}
          {current && !current.id && (
            <div className="mb-1 flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm text-primary">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary/40" />
              <span className="flex-1 truncate italic">{nameDraft.trim() || 'Nouveau workflow'}</span>
              <span className="text-[10px] uppercase tracking-wide text-primary/60">brouillon</span>
            </div>
          )}
          {/* Ligne de workflow (draggable → glisser dans un dossier). */}
          {(() => {
            const renderRow = (a: Automation) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => selectAuto(a)}
                className={cn('group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  current?.id === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/30 group-hover:text-muted-foreground/60" />
                <span className={cn('h-2 w-2 shrink-0 rounded-full', a.is_active ? 'bg-green-500' : 'bg-muted-foreground/40')} />
                <span className="flex-1 truncate">{a.name || 'Sans nom'}</span>
                <button onClick={(e) => { e.stopPropagation(); remove(a) }} title="Supprimer"
                  className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )

            // Zone de dépôt (dossier ou « non classés »).
            const dropProps = (folderId: string | null) => ({
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverFolder(folderId ?? 'none') },
              onDragLeave: () => setDragOverFolder((cur) => cur === (folderId ?? 'none') ? null : cur),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                setDragOverFolder(null)
                if (id) moveToFolder(id, folderId)
              },
            })

            const unfiled = automations.filter((a) => !a.folder_id)

            return (
              <>
                {/* Dossiers */}
                {folders.map((f) => {
                  const items = automations.filter((a) => a.folder_id === f.id)
                  const hot = dragOverFolder === f.id
                  return (
                    <div key={f.id} {...dropProps(f.id)}
                      className={cn('mb-1 rounded-lg border border-transparent', hot && 'border-primary/50 bg-primary/5')}>
                      <div className="group flex items-center gap-1.5 px-2 py-1.5">
                        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: f.color || undefined }} />
                        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground/50">{items.length}</span>
                        <button onClick={() => deleteFolder(f)} title="Supprimer le dossier"
                          className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-colors hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="pl-2">
                        {items.map(renderRow)}
                        {items.length === 0 && (
                          <p className="px-3 py-2 text-[11px] italic text-muted-foreground/50">Glissez un workflow ici</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Non classés */}
                <div {...dropProps(null)}
                  className={cn('rounded-lg border border-transparent', dragOverFolder === 'none' && 'border-primary/50 bg-primary/5')}>
                  {folders.length > 0 && unfiled.length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Non classés</div>
                  )}
                  {unfiled.map(renderRow)}
                </div>

                {automations.length === 0 && !(current && !current.id) && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun workflow. Créez le premier.</p>
                )}
              </>
            )
          })()}
        </aside>
        )}

        {/* Zone centrale : wizard de création, sinon builder, sinon vide. */}
        {showWizard ? (
          <div className="min-h-0 overflow-y-auto">
            <WorkflowWizard
              templates={templates}
              onComplete={onWizardComplete}
              onCancel={() => { setShowWizard(false); setCurrent(automations[0] || null) }}
            />
          </div>
        ) : current && graph ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <GitBranch className="h-4 w-4 text-violet-600" />
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Nom du workflow" className="h-8 max-w-xs border-0 bg-transparent px-0 text-sm font-medium focus-visible:ring-0" />
            </div>
            <div className="min-h-0 flex-1 p-4">
              <WorkflowBuilder graph={graph} templates={templates} storeName={storeName} onChange={setGraph} automationId={current?.id ?? null} />
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
