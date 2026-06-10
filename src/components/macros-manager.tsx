'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Plus, Trash2, Loader2, Pencil } from 'lucide-react'
import type { Macro } from '@/types/database'

/**
 * Gestionnaire de macros (réponses pré-enregistrées) — affiché dans les Paramètres.
 * Les macros sont ensuite insérables en 1 clic depuis la zone de saisie du chat.
 */
export function MacrosManager() {
  const [macros, setMacros] = useState<Macro[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Macro | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/macros')
      const json = await res.json()
      if (res.ok) setMacros(json.data || [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); setTitle(''); setContent(''); setShowForm(true)
  }
  function openEdit(m: Macro) {
    setEditing(m); setTitle(m.title); setContent(m.content); setShowForm(true)
  }

  async function save() {
    if (!title.trim() || !content.trim()) { toast.error('Titre et contenu requis'); return }
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/macros/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) })
        : await fetch('/api/macros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      toast.success(editing ? 'Macro modifiée' : 'Macro créée')
      setShowForm(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function remove(m: Macro) {
    if (!confirm(`Supprimer la macro « ${m.title} » ?`)) return
    const res = await fetch(`/api/macros/${m.id}`, { method: 'DELETE' })
    if (res.ok) { setMacros(prev => prev.filter(x => x.id !== m.id)); toast.success('Macro supprimée') }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Macros
        </CardTitle>
        <CardDescription>
          Réponses pré-enregistrées, insérables en 1 clic depuis le chat (bouton ⚡).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {macros.length === 0 && !showForm && (
              <p className="text-sm text-muted-foreground">Aucune macro pour l&apos;instant.</p>
            )}
            {macros.map(m => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.content}</div>
                  {m.usage_count > 0 && <div className="mt-0.5 text-[10px] text-muted-foreground/60">Utilisée {m.usage_count}×</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}

            {showForm ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Titre</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : Remerciement" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contenu</Label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={3}
                    placeholder="Merci pour votre message ! Nous revenons vers vous au plus vite."
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    {editing ? 'Enregistrer' : 'Créer'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Annuler</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" /> Nouvelle macro
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
