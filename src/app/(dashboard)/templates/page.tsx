'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WhatsAppTemplate } from '@/types/database'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, Trash2, Send, RefreshCw, FileText, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
  pending: { label: 'En attente Meta', cls: 'bg-amber-500/15 text-amber-500' },
  approved: { label: 'Approuvé', cls: 'bg-green-500/15 text-green-500' },
  rejected: { label: 'Refusé', cls: 'bg-red-500/15 text-red-500' },
}

const CATEGORIES = [
  { value: 'UTILITY', label: 'Utilitaire (commande, livraison, SAV)' },
  { value: 'MARKETING', label: 'Marketing (promo, relance)' },
  { value: 'AUTHENTICATION', label: 'Authentification (code OTP)' },
]

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espagnol' },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Form
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('fr')
  const [category, setCategory] = useState('UTILITY')
  const [bodyText, setBodyText] = useState('')
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates')
      const json = await res.json()
      if (res.ok) setTemplates(json.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function openCreate() {
    setEditing(null)
    setName(''); setLanguage('fr'); setCategory('UTILITY')
    setBodyText(''); setHeaderText(''); setFooterText('')
    setDialogOpen(true)
  }

  function openEdit(t: WhatsAppTemplate) {
    setEditing(t)
    setName(t.name); setLanguage(t.language); setCategory(t.category)
    setBodyText(t.body_text); setHeaderText(t.header_text || ''); setFooterText(t.footer_text || '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!name.trim() || !bodyText.trim()) { toast.error('Nom et message requis'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/templates/${editing.id}` : '/api/templates'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language, category, body_text: bodyText, header_text: headerText, footer_text: footerText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setDialogOpen(false)
      await fetchTemplates()
      toast.success(editing ? 'Modèle modifié' : 'Modèle créé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(t: WhatsAppTemplate) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchTemplates()
      toast.success('Soumis à Meta pour approbation')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(t: WhatsAppTemplate) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      await fetchTemplates()
      toast.success('Modèle supprimé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/templates/sync', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        await fetchTemplates()
        toast.success(`${json.data?.synced ?? 0} statut(s) mis à jour`)
      } else throw new Error(json.error || 'Erreur')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <BlobLoaderScreen />

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Modèles de messages</h1>
          <p className="text-sm text-muted-foreground">
            Messages pré-approuvés par Meta, requis pour relancer un client hors fenêtre de 24h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', syncing && 'animate-spin')} />
            Synchroniser
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />Nouveau modèle
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Aucun modèle. Créez-en un pour pouvoir relancer vos clients.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const st = STATUS_STYLE[t.status] || STATUS_STYLE.draft
            return (
              <div key={t.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-medium">{t.name}</code>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', st.cls)}>{st.label}</span>
                      <span className="text-xs text-muted-foreground uppercase">{t.language} · {t.category}</span>
                    </div>
                    {t.header_text && <p className="mt-2 text-sm font-medium">{t.header_text}</p>}
                    <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{t.body_text}</p>
                    {t.footer_text && <p className="mt-1 text-xs text-muted-foreground italic">{t.footer_text}</p>}
                    {t.variables_count > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{t.variables_count} variable(s)</p>
                    )}
                    {t.status === 'rejected' && t.rejection_reason && (
                      <p className="mt-1 text-xs text-red-500">Refus : {t.rejection_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.status === 'draft' && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => handleSubmit(t)}>
                          {busyId === t.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                          Soumettre
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busyId === t.id} onClick={() => handleDelete(t)}>
                      {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
            <DialogDescription>
              Utilisez {'{{1}}'}, {'{{2}}'}… pour les variables (ex : prénom, n° de commande).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom technique</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="confirmation_commande" />
              <p className="text-xs text-muted-foreground">Minuscules, chiffres et _ uniquement.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Langue</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>En-tête (optionnel)</Label>
              <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Votre commande est confirmée" />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={5}
                placeholder={'Bonjour {{1}}, votre commande #{{2}} est confirmée ! Livraison prévue le {{3}}.'} />
            </div>
            <div className="space-y-1.5">
              <Label>Pied de page (optionnel)</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Merci de votre confiance" />
            </div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !bodyText.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Enregistrer' : 'Créer le modèle'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
