'use client'

import { useEffect, useState, useCallback } from 'react'
import type { LifecycleStage } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Workflow,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

const STAGE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
  '#14B8A6', // teal
  '#A855F7', // purple
]

const STAGE_ICONS = [
  { value: 'sparkles', label: 'Nouveau' },
  { value: 'flame', label: 'Chaud' },
  { value: 'calendar', label: 'Booking' },
  { value: 'user', label: 'Client' },
  { value: 'heart', label: 'Personnel' },
  { value: 'search', label: 'Qualification' },
  { value: 'star', label: 'VIP' },
  { value: 'ban', label: 'Perdu' },
]

type UnanalyzedCounts = {
  unanalyzed: number
  needs_reanalysis: number
  total: number
}

type StageStats = Record<string, number>

export default function LifecyclePage() {
  const [stages, setStages] = useState<LifecycleStage[]>([])
  const [loading, setLoading] = useState(true)
  const [unanalyzed, setUnanalyzed] = useState<UnanalyzedCounts>({ unanalyzed: 0, needs_reanalysis: 0, total: 0 })
  const [stageStats, setStageStats] = useState<StageStats>({})

  // Création
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')
  const [newIcon, setNewIcon] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Édition
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Suppression
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Analyse bulk
  const [analyzing, setAnalyzing] = useState(false)

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch('/api/lifecycle/stages')
      const json = await res.json()
      if (res.ok && json.data) {
        setStages(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des stages')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUnanalyzed = useCallback(async () => {
    try {
      const res = await fetch('/api/lifecycle/analyze/unanalyzed')
      const json = await res.json()
      if (res.ok && json.data) {
        setUnanalyzed(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations?limit=100')
      const json = await res.json()
      if (res.ok && json.data) {
        const stats: StageStats = {}
        for (const conv of json.data) {
          const stageId = conv.lifecycle_stage_id || 'none'
          stats[stageId] = (stats[stageId] || 0) + 1
        }
        setStageStats(stats)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchStages()
    fetchUnanalyzed()
    fetchStats()
  }, [fetchStages, fetchUnanalyzed, fetchStats])

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/lifecycle/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          icon: newIcon || null,
          description: newDescription.trim() || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setStages((prev) => [...prev, json.data])
        setNewName('')
        setNewColor('#6366F1')
        setNewIcon('')
        setNewDescription('')
        setShowCreate(false)
        toast.success('Stage créé')
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setCreating(false)
    }
  }

  function startEditing(stage: LifecycleStage) {
    setEditingId(stage.id)
    setEditName(stage.name)
    setEditColor(stage.color)
    setEditIcon(stage.icon || '')
    setEditDescription(stage.description || '')
  }

  function cancelEditing() {
    setEditingId(null)
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/lifecycle/stages/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor,
          icon: editIcon || null,
          description: editDescription.trim() || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setStages((prev) => prev.map((s) => (s.id === editingId ? json.data : s)))
        cancelEditing()
        toast.success('Stage modifié')
      } else {
        toast.error(json.error || 'Erreur lors de la modification')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/lifecycle/stages/${deleteId}`, { method: 'DELETE' })
      if (res.ok) {
        setStages((prev) => prev.filter((s) => s.id !== deleteId))
        setDeleteId(null)
        toast.success('Stage supprimé')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setDeleting(false)
    }
  }

  async function moveStage(stageId: string, direction: 'up' | 'down') {
    const idx = stages.findIndex((s) => s.id === stageId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === stages.length - 1) return

    const newStages = [...stages]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]]
    setStages(newStages)

    // Sauvegarder l'ordre
    try {
      await fetch('/api/lifecycle/stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newStages.map((s) => s.id) }),
      })
    } catch {
      // Rollback
      setStages(stages)
      toast.error('Erreur lors du réordonnement')
    }
  }

  async function handleBulkAnalyze() {
    if (analyzing) return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/lifecycle/analyze/unanalyzed', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        const classified = (json.data || []).filter((r: { stageId: string | null }) => r.stageId !== null).length
        const failed = json.total_analyzed - classified
        if (classified > 0) {
          toast.success(`${classified} conversation(s) classifiée(s) — ${json.total_tokens} tokens`)
        }
        if (failed > 0) {
          const failedReasons = (json.data || [])
            .filter((r: { stageId: string | null }) => r.stageId === null)
            .map((r: { reason: string }) => r.reason)
            .slice(0, 3)
          toast.warning(`${failed} conversation(s) non classifiée(s): ${failedReasons.join(', ')}`)
        }
        if (json.total_analyzed === 0) {
          toast.info('Aucune conversation à analyser')
        }
        fetchStages()
        fetchUnanalyzed()
        fetchStats()
      } else {
        toast.error(json.error || 'Erreur lors de l\'analyse')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setAnalyzing(false)
    }
  }

  const stageToDelete = stages.find((s) => s.id === deleteId)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Lifecycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Classifiez automatiquement vos conversations en stades de pipeline.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? 'secondary' : 'default'}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau stage
        </Button>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Analyse en masse */}
        {unanalyzed.total > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium">
                  {unanalyzed.unanalyzed > 0 && (
                    <span>{unanalyzed.unanalyzed} conversation(s) non classifiée(s)</span>
                  )}
                  {unanalyzed.unanalyzed > 0 && unanalyzed.needs_reanalysis > 0 && <span> • </span>}
                  {unanalyzed.needs_reanalysis > 0 && (
                    <span>{unanalyzed.needs_reanalysis} nécessitant une ré-analyse</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  L&apos;analyse utilise des tokens IA (~200 tokens par conversation)
                </p>
              </div>
              <Button onClick={handleBulkAnalyze} disabled={analyzing || stages.length === 0} size="sm">
                {analyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Analyser tout
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Formulaire de création */}
        {showCreate && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Nouveau stage
              </CardTitle>
              <CardDescription>
                Définissez un stade du pipeline. La description aide l&apos;IA à classifier correctement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Nom *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: New Lead, Client, VIP..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreate()
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Icône</label>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_ICONS.map((icon) => (
                      <button
                        key={icon.value}
                        onClick={() => setNewIcon(newIcon === icon.value ? '' : icon.value)}
                        className={cn(
                          'px-2 py-1 text-xs rounded-md border transition-all',
                          newIcon === icon.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-muted'
                        )}
                      >
                        {icon.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Description (pour l&apos;IA)
                </label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ex: Le contact vient d'envoyer son premier message, n'a pas encore été qualifié..."
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Couleur</label>
                <div className="flex flex-wrap gap-2">
                  {STAGE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={cn(
                        'h-7 w-7 rounded-full transition-all',
                        newColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-110'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pipeline des stages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Pipeline ({stages.length} stade{stages.length > 1 ? 's' : ''})
            </CardTitle>
            <CardDescription>
              Ordonnez vos stades du début à la fin du parcours client. L&apos;IA utilise l&apos;ordre et la description pour classifier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <div className="text-center py-8">
                <Workflow className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun stage configuré
                </p>
                <p className="text-xs text-muted-foreground">
                  Créez vos premiers stades de pipeline pour commencer la classification.
                </p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer un stage
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {editingId === stage.id ? (
                      // Mode édition
                      <div className="flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nom du stage..."
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveEdit()
                              }
                              if (e.key === 'Escape') cancelEditing()
                            }}
                          />
                          <div className="flex flex-wrap gap-1">
                            {STAGE_ICONS.map((icon) => (
                              <button
                                key={icon.value}
                                onClick={() => setEditIcon(editIcon === icon.value ? '' : icon.value)}
                                className={cn(
                                  'px-1.5 py-0.5 text-xs rounded border transition-all',
                                  editIcon === icon.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-muted'
                                )}
                              >
                                {icon.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <Textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description pour l'IA..."
                          rows={2}
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {STAGE_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className={cn(
                                'h-6 w-6 rounded-full transition-all',
                                editColor === color ? 'ring-2 ring-offset-1 ring-primary' : 'hover:scale-110'
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                            <X className="mr-1 h-4 w-4" /> Annuler
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={!editName.trim() || saving}>
                            {saving ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-4 w-4" />
                            )}
                            Enregistrer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Mode affichage
                      <>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                          <span className="text-xs w-5 text-center">{index + 1}</span>
                        </div>
                        <span
                          className="h-4 w-4 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate" style={{ color: stage.color }}>
                              {stage.name}
                            </span>
                            {stage.icon && (
                              <span className="text-xs text-muted-foreground">
                                ({STAGE_ICONS.find((i) => i.value === stage.icon)?.label || stage.icon})
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">
                              {stageStats[stage.id] || 0} conv.
                            </span>
                          </div>
                          {stage.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {stage.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => moveStage(stage.id, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => moveStage(stage.id, 'down')}
                            disabled={index === stages.length - 1}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startEditing(stage)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:text-destructive"
                            onClick={() => setDeleteId(stage.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats rapides */}
        {stages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Répartition</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {stages.map((stage) => (
                  <div key={stage.id} className="flex items-center gap-2 p-2 rounded-md border">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm truncate">{stage.name}</span>
                    <span className="text-sm font-bold ml-auto">{stageStats[stage.id] || 0}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                  <span className="h-3 w-3 rounded-full shrink-0 bg-muted-foreground/30" />
                  <span className="text-sm text-muted-foreground truncate">Non classifié</span>
                  <span className="text-sm font-bold ml-auto">{stageStats['none'] || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce stage ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le stage{' '}
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${stageToDelete?.color}20`, color: stageToDelete?.color }}
              >
                {stageToDelete?.name}
              </span>{' '}
              sera supprimé. Les conversations associées perdront leur classification. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
