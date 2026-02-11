'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ConversationTag } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Tag,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { useTranslation } from '@/i18n/context'

// Couleurs prédéfinies pour les tags
const TAG_COLORS = [
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
  '#F43F5E', // rose
  '#78716C', // stone
  '#0EA5E9', // sky
]

export default function TagsPage() {
  const { t } = useTranslation()
  const [tags, setTags] = useState<ConversationTag[]>([])
  const [loading, setLoading] = useState(true)

  // Création de tag
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const [creating, setCreating] = useState(false)

  // Édition de tag
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)

  // Suppression de tag
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      const json = await res.json()
      if (res.ok && json.data) {
        setTags(json.data)
      }
    } catch {
      toast.error(t('tags.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  async function handleCreateTag() {
    if (!newTagName.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setTags((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
        setNewTagName('')
        setNewTagColor('#3B82F6')
        toast.success(t('tags.created'))
      } else {
        toast.error(json.error || t('tags.create_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setCreating(false)
    }
  }

  function startEditing(tag: ConversationTag) {
    setEditingTagId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  function cancelEditing() {
    setEditingTagId(null)
    setEditName('')
    setEditColor('')
  }

  async function handleSaveEdit() {
    if (!editingTagId || !editName.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tags/${editingTagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setTags((prev) =>
          prev
            .map((tg) => (tg.id === editingTagId ? json.data : tg))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        cancelEditing()
        toast.success(t('tags.edited'))
      } else {
        toast.error(json.error || t('tags.edit_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTag() {
    if (!deleteTagId || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tags/${deleteTagId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTags((prev) => prev.filter((tg) => tg.id !== deleteTagId))
        setDeleteTagId(null)
        toast.success(t('tags.deleted'))
      } else {
        const json = await res.json()
        toast.error(json.error || t('tags.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(false)
    }
  }

  const tagToDelete = tags.find((tg) => tg.id === deleteTagId)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">{t('tags.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('tags.description')}
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Créer un nouveau tag */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('tags.create_section')}
            </CardTitle>
            <CardDescription>
              {t('tags.create_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t('tags.tag_placeholder')}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateTag()
                  }
                }}
              />
              <Button onClick={handleCreateTag} disabled={!newTagName.trim() || creating}>
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {t('common.create')}
              </Button>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('tags.color')}</p>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={cn(
                      'h-8 w-8 rounded-full transition-all',
                      newTagColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            {/* Aperçu */}
            {newTagName.trim() && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">{t('tags.preview')}</p>
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: `${newTagColor}20`, color: newTagColor }}
                >
                  {newTagName.trim()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Liste des tags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('tags.your_tags', { count: String(tags.length) })}
            </CardTitle>
            <CardDescription>
              {t('tags.your_tags_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <div className="text-center py-8">
                <Tag className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {t('tags.no_tags')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('tags.no_tags_desc')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {editingTagId === tag.id ? (
                      // Mode édition
                      <>
                        <div className="flex-1 space-y-3">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t('tags.tag_placeholder')}
                            className="h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveEdit()
                              }
                              if (e.key === 'Escape') {
                                cancelEditing()
                              }
                            }}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {TAG_COLORS.map((color) => (
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
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={handleSaveEdit}
                            disabled={!editName.trim() || saving}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      // Mode affichage
                      <>
                        <span
                          className="h-4 w-4 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span
                          className="flex-1 text-sm font-medium"
                          style={{ color: tag.color }}
                        >
                          {tag.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => startEditing(tag)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:text-destructive"
                            onClick={() => setDeleteTagId(tag.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deleteTagId} onOpenChange={(open) => !open && setDeleteTagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tags.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('tags.delete_desc', { name: '' })}{' '}
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${tagToDelete?.color}20`, color: tagToDelete?.color }}
              >
                {tagToDelete?.name}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteTag()
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
