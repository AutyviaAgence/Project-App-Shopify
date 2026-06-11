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
import { Plus, Loader2, Trash2, Send, RefreshCw, FileText, Pencil, Sparkles } from 'lucide-react'
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
  const [seeding, setSeeding] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  useEffect(() => {
    // Charge la liste puis auto-synchronise le statut Meta en arrière-plan
    // (pas de bouton manuel obligatoire — comme Respond.io).
    fetchTemplates().then(() => {
      fetch('/api/templates/sync', { method: 'POST' })
        .then((r) => r.json())
        .then((j) => { if (j.data?.synced > 0) fetchTemplates() })
        .catch(() => {})
    })
  }, [fetchTemplates])

  async function handleSeedDefaults() {
    setSeeding(true)
    try {
      const res = await fetch('/api/templates/seed', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchTemplates()
      const n = json.data?.created ?? 0
      toast.success(n > 0 ? `${n} modèle(s) ajouté(s)` : 'Vous avez déjà tous les modèles par défaut')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSeeding(false)
    }
  }

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

  // Modèle sélectionné (fallback : le premier de la liste)
  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0] || null

  return (
    <div className="flex h-full flex-col p-4 md:p-6 gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Modèles de messages</h1>
          <p className="text-sm text-muted-foreground">
            Messages pré-approuvés par Meta, requis pour relancer un client hors fenêtre de 24h.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={seeding}>
            {seeding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Modèles par défaut
          </Button>
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
          <p className="text-sm mb-3">Aucun modèle. Démarrez avec nos modèles e-commerce prêts à l&apos;emploi.</p>
          <Button size="sm" onClick={handleSeedDefaults} disabled={seeding}>
            {seeding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Ajouter les modèles par défaut
          </Button>
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-[320px_1fr]">
          {/* Sidebar gauche : liste des modèles */}
          <div className="space-y-1.5 overflow-y-auto rounded-xl border p-2">
            {templates.map((t) => {
              const st = STATUS_STYLE[t.status] || STATUS_STYLE.draft
              const active = selectedTemplate?.id === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <code className="truncate text-sm font-medium">{t.name}</code>
                    <span className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px]', st.cls)}>{st.label}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.body_text}</div>
                  <div className="mt-0.5 text-[10px] uppercase text-muted-foreground/70">{t.language} · {t.category}</div>
                </button>
              )
            })}
          </div>

          {/* Droite : visualisation WhatsApp + actions */}
          <div className="flex flex-col rounded-xl border overflow-hidden">
            {selectedTemplate ? (
              <>
                {/* Barre d'actions */}
                <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="truncate text-sm font-medium">{selectedTemplate.name}</code>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs', (STATUS_STYLE[selectedTemplate.status] || STATUS_STYLE.draft).cls)}>
                      {(STATUS_STYLE[selectedTemplate.status] || STATUS_STYLE.draft).label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedTemplate.status === 'draft' && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(selectedTemplate)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === selectedTemplate.id} onClick={() => handleSubmit(selectedTemplate)}>
                          {busyId === selectedTemplate.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                          Soumettre
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busyId === selectedTemplate.id} onClick={() => handleDelete(selectedTemplate)}>
                      {busyId === selectedTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Fond WhatsApp + grande bulle */}
                <div
                  className="flex-1 overflow-y-auto p-6"
                  style={{
                    backgroundColor: '#e5ddd5',
                    backgroundImage: 'url("/whatsapp-bg.webp")',
                    backgroundSize: 'auto',
                    backgroundRepeat: 'repeat',
                  }}
                >
                  <div className="mx-auto max-w-md">
                    <div className="ml-auto max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 shadow-sm">
                      {selectedTemplate.header_text && (
                        <p className="text-sm font-semibold text-gray-900">{selectedTemplate.header_text}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{selectedTemplate.body_text}</p>
                      {selectedTemplate.footer_text && (
                        <p className="mt-1 text-[11px] text-gray-500">{selectedTemplate.footer_text}</p>
                      )}
                      <div className="mt-0.5 text-right text-[10px] text-gray-500">12:00 ✓✓</div>
                    </div>
                  </div>
                  <div className="mx-auto mt-3 max-w-md text-center text-xs text-gray-600">
                    {selectedTemplate.variables_count > 0 && `${selectedTemplate.variables_count} variable(s) — `}
                    Les variables {'{{1}}'}, {'{{2}}'}… seront remplacées à l&apos;envoi.
                  </div>
                  {selectedTemplate.status === 'rejected' && selectedTemplate.rejection_reason && (
                    <p className="mx-auto mt-2 max-w-md text-center text-xs text-red-500">Refus Meta : {selectedTemplate.rejection_reason}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Sélectionnez un modèle pour le visualiser.
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
            <DialogDescription>
              Utilisez {'{{1}}'}, {'{{2}}'}… pour les variables (ex : prénom, n° de commande).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
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

          {/* Aperçu WhatsApp en direct */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Aperçu</Label>
            <div
              className="rounded-xl border bg-[#e5ddd5] p-4"
              style={{ backgroundImage: 'url("/whatsapp-bg.webp")', backgroundRepeat: 'repeat' }}
            >
              <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-2 shadow-sm dark:bg-[#005c4b]">
                {headerText && (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{headerText}</p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100">
                  {bodyText || <span className="text-gray-400">Votre message apparaîtra ici…</span>}
                </p>
                {footerText && (
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{footerText}</p>
                )}
                <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00</div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Les variables {'{{1}}'}, {'{{2}}'}… seront remplacées à l&apos;envoi.
            </p>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
