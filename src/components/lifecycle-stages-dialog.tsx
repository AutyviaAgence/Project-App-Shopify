'use client'

import { useState } from 'react'
import type { LifecycleStage } from '@/types/database'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Loader2, Pencil, Trash2, Check, X, ArrowUp, ArrowDown } from 'lucide-react'

const STAGE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#EC4899',
  '#06B6D4', '#F97316', '#6366F1', '#84CC16', '#14B8A6', '#8B5CF6',
]

interface LifecycleStagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: LifecycleStage[]
  /** Rappelé après toute modification pour rafraîchir la liste côté parent */
  onStagesChanged: () => void | Promise<void>
}

/**
 * Gestion des étapes du cycle de vie (création, édition, suppression, ordre).
 * Réutilise l'API /api/lifecycle/stages. Remplace l'ancienne page /lifecycle.
 */
export function LifecycleStagesDialog({
  open,
  onOpenChange,
  stages,
  onStagesChanged,
}: LifecycleStagesDialogProps) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(STAGE_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/lifecycle/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Erreur')
      }
      setNewName('')
      setNewColor(STAGE_COLORS[0])
      await onStagesChanged()
      toast.success('Étape créée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(stage: LifecycleStage) {
    setEditingId(stage.id)
    setEditName(stage.name)
    setEditColor(stage.color)
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/lifecycle/stages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Erreur')
      }
      setEditingId(null)
      await onStagesChanged()
      toast.success('Étape modifiée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/lifecycle/stages/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Erreur')
      }
      await onStagesChanged()
      toast.success('Étape supprimée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReorder(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= stages.length) return
    const order = stages.map((s) => s.id)
    ;[order[index], order[target]] = [order[target], order[index]]
    setBusyId(stages[index].id)
    try {
      const res = await fetch('/api/lifecycle/stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      if (!res.ok) throw new Error('Erreur')
      await onStagesChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gérer les étapes</DialogTitle>
          <DialogDescription>
            Les étapes du cycle de vie servent à classer vos conversations (nouveau, en cours, client, perdu…).
          </DialogDescription>
        </DialogHeader>

        {/* Liste des étapes existantes */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {stages.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune étape pour l&apos;instant. Créez-en une ci-dessous.
            </p>
          )}
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-md border p-2">
              {editingId === stage.id ? (
                <>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busyId === stage.id} onClick={() => handleSaveEdit(stage.id)}>
                    {busyId === stage.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="flex-1 text-sm truncate">{stage.name}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0 || busyId !== null} onClick={() => handleReorder(index, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === stages.length - 1 || busyId !== null} onClick={() => handleReorder(index, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(stage)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={busyId === stage.id} onClick={() => handleDelete(stage.id)}>
                    {busyId === stage.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Création */}
        <div className="flex items-center gap-2 border-t pt-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            title="Couleur"
          />
          <Input
            placeholder="Nom de l'étape (ex : Nouveau lead)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Ajouter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
