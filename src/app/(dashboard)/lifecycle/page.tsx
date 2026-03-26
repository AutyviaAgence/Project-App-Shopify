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
  BarChart3,
  TrendingUp,
  Zap,
  History,
  ArrowRight,
} from 'lucide-react'
import { useTranslation } from '@/i18n/context'

const STAGE_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#0EA5E9', // sky
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
  '#14B8A6', // teal
  '#0EA5E9', // sky-alt
]

const STAGE_ICONS = [
  { value: 'sparkles', labelKey: 'lifecycle.icon_new' },
  { value: 'flame', labelKey: 'lifecycle.icon_hot' },
  { value: 'calendar', labelKey: 'lifecycle.icon_booking' },
  { value: 'user', labelKey: 'lifecycle.icon_client' },
  { value: 'heart', labelKey: 'lifecycle.icon_personal' },
  { value: 'search', labelKey: 'lifecycle.icon_qualification' },
  { value: 'star', labelKey: 'lifecycle.icon_vip' },
  { value: 'ban', labelKey: 'lifecycle.icon_lost' },
]

type UnanalyzedCounts = {
  unanalyzed: number
  needs_reanalysis: number
  total: number
}

type StageStats = Record<string, number>

type DistributionItem = {
  stage_id: string
  stage_name: string
  stage_color: string
  stage_icon: string | null
  count: number
  percentage: number
}

type TransitionItem = {
  id: string
  conversation_id: string
  from_stage_name: string | null
  from_stage_color: string | null
  to_stage_name: string | null
  to_stage_color: string | null
  reason: string | null
  changed_by: string
  tokens_used: number
  created_at: string
}

type LifecycleStats = {
  total_conversations: number
  classified: number
  unclassified: number
  distribution: DistributionItem[]
  recent_transitions: TransitionItem[]
  tokens_used_total: number
  ai_analyses_count: number
  manual_changes_count: number
}

export default function LifecyclePage() {
  const { t, locale } = useTranslation()
  const [stages, setStages] = useState<LifecycleStage[]>([])
  const [loading, setLoading] = useState(true)
  const [unanalyzed, setUnanalyzed] = useState<UnanalyzedCounts>({ unanalyzed: 0, needs_reanalysis: 0, total: 0 })
  const [stageStats, setStageStats] = useState<StageStats>({})
  const [lifecycleStats, setLifecycleStats] = useState<LifecycleStats | null>(null)

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
      toast.error(t('lifecycle.load_error'))
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
      const res = await fetch('/api/lifecycle/stats')
      const json = await res.json()
      if (res.ok && json.data) {
        setLifecycleStats(json.data)
        // Also set stageStats for the pipeline card
        const stats: StageStats = {}
        for (const d of json.data.distribution) {
          stats[d.stage_id] = d.count
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
        toast.success(t('lifecycle.stage_created'))
      } else {
        toast.error(json.error || t('lifecycle.create_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.success(t('lifecycle.stage_edited'))
      } else {
        toast.error(json.error || t('lifecycle.edit_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.success(t('lifecycle.stage_deleted'))
      } else {
        const json = await res.json()
        toast.error(json.error || t('lifecycle.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
      toast.error(t('lifecycle.reorder_error'))
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
          toast.success(t('lifecycle.classified_count', { count: String(classified), tokens: String(json.total_tokens) }))
        }
        if (failed > 0) {
          const failedReasons = (json.data || [])
            .filter((r: { stageId: string | null }) => r.stageId === null)
            .map((r: { reason: string }) => r.reason)
            .slice(0, 3)
          toast.warning(t('lifecycle.unclassified_count', { count: String(failed), reasons: failedReasons.join(', ') }))
        }
        if (json.total_analyzed === 0) {
          toast.info(t('lifecycle.no_conversations_to_analyze'))
        }
        fetchStages()
        fetchUnanalyzed()
        fetchStats()
      } else {
        toast.error(json.error || t('lifecycle.analyze_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
      <div data-tour="lifecycle-header" className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('lifecycle.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('lifecycle.description')}
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? 'secondary' : 'default'}>
          <Plus className="mr-2 h-4 w-4" />
          {t('lifecycle.new_stage')}
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
                    <span>{t('lifecycle.unclassified_conversations', { count: String(unanalyzed.unanalyzed) })}</span>
                  )}
                  {unanalyzed.unanalyzed > 0 && unanalyzed.needs_reanalysis > 0 && <span> • </span>}
                  {unanalyzed.needs_reanalysis > 0 && (
                    <span>{t('lifecycle.needs_reanalysis', { count: String(unanalyzed.needs_reanalysis) })}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('lifecycle.analysis_tokens_note')}
                </p>
              </div>
              <Button onClick={handleBulkAnalyze} disabled={analyzing || stages.length === 0} size="sm">
                {analyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {t('lifecycle.analyze_all')}
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
                {t('lifecycle.new_stage')}
              </CardTitle>
              <CardDescription>
                {t('lifecycle.new_stage_desc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t('lifecycle.name_label')}</label>
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
                  <label className="text-sm font-medium mb-1.5 block">{t('lifecycle.icon_label')}</label>
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
                        {t(icon.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {t('lifecycle.description_label')}
                </label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ex: Le contact vient d'envoyer son premier message, n'a pas encore été qualifié..."
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('lifecycle.color_label')}</label>
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
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.create')}
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
{t('lifecycle.pipeline', { count: String(stages.length) })}
            </CardTitle>
            <CardDescription>
{t('lifecycle.pipeline_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <div className="text-center py-8">
                <Workflow className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {t('lifecycle.no_stages')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('lifecycle.no_stages_desc')}
                </p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('lifecycle.create_stage')}
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
                                {t(icon.labelKey)}
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
                            <X className="mr-1 h-4 w-4" /> {t('common.cancel')}
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={!editName.trim() || saving}>
                            {saving ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-4 w-4" />
                            )}
                            {t('common.save')}
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
                                ({(() => { const found = STAGE_ICONS.find((i) => i.value === stage.icon); return found ? t(found.labelKey) : stage.icon; })()})
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

        {/* Statistiques détaillées */}
        {stages.length > 0 && lifecycleStats && (
          <>
            {/* KPIs */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-xs">{t('lifecycle.total')}</span>
                  </div>
                  <p className="text-2xl font-bold">{lifecycleStats.total_conversations}</p>
                  <p className="text-xs text-muted-foreground">{t('lifecycle.conversations')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">{t('lifecycle.classified')}</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{lifecycleStats.classified}</p>
                  <p className="text-xs text-muted-foreground">
                    {lifecycleStats.total_conversations > 0
                      ? `${Math.round((lifecycleStats.classified / lifecycleStats.total_conversations) * 100)}%`
                      : '0%'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Zap className="h-4 w-4" />
                    <span className="text-xs">{t('lifecycle.ai_analyses')}</span>
                  </div>
                  <p className="text-2xl font-bold">{lifecycleStats.ai_analyses_count}</p>
                  <p className="text-xs text-muted-foreground">
                    {lifecycleStats.tokens_used_total.toLocaleString()} {t('lifecycle.tokens')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Pencil className="h-4 w-4" />
                    <span className="text-xs">{t('lifecycle.manual_changes')}</span>
                  </div>
                  <p className="text-2xl font-bold">{lifecycleStats.manual_changes_count}</p>
                  <p className="text-xs text-muted-foreground">{t('lifecycle.changes')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Répartition avec barres visuelles */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  {t('lifecycle.distribution')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lifecycleStats.distribution.map((d) => (
                  <div key={d.stage_id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: d.stage_color }}
                        />
                        <span className="text-sm font-medium">{d.stage_name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {d.count} ({d.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${d.percentage}%`,
                          backgroundColor: d.stage_color,
                          minWidth: d.count > 0 ? '4px' : '0',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Dernières transitions */}
            {lifecycleStats.recent_transitions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4" />
                    {t('lifecycle.recent_transitions')}
                  </CardTitle>
                  <CardDescription>
                    {t('lifecycle.last_10')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lifecycleStats.recent_transitions.map((tr) => (
                      <div
                        key={tr.id}
                        className="flex items-center gap-2 p-2 rounded-md border text-sm"
                      >
                        {/* From stage */}
                        {tr.from_stage_name ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
                            style={{
                              backgroundColor: `${tr.from_stage_color}20`,
                              color: tr.from_stage_color || undefined,
                            }}
                          >
                            {tr.from_stage_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted shrink-0">
                            —
                          </span>
                        )}

                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />

                        {/* To stage */}
                        {tr.to_stage_name ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
                            style={{
                              backgroundColor: `${tr.to_stage_color}20`,
                              color: tr.to_stage_color || undefined,
                            }}
                          >
                            {tr.to_stage_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted shrink-0">
                            —
                          </span>
                        )}

                        {/* Reason */}
                        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                          {tr.reason}
                        </span>

                        {/* Changed by + time */}
                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          {tr.changed_by === 'ai' ? (
                            <Sparkles className="h-3 w-3" />
                          ) : (
                            <Pencil className="h-3 w-3" />
                          )}
                          {new Date(tr.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('lifecycle.delete_stage_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('lifecycle.delete_stage_desc', { name: stageToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
