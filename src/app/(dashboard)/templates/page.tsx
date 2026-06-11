'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { WhatsAppTemplate, TemplateButton } from '@/types/database'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, Trash2, Send, RefreshCw, FileText, Pencil, Sparkles, Bold, Italic, Strikethrough, Braces, Image as ImageIcon, Video, ExternalLink, Phone, Copy } from 'lucide-react'
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

/** Rend le formatage WhatsApp (*gras*, _italique_, ~barré~) en vrai style dans l'aperçu. */
function renderWhatsAppFormat(text: string): React.ReactNode {
  if (!text) return null
  // Découpe sur les marqueurs en gardant le délimiteur
  const parts = text.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g)
  return parts.map((part, i) => {
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>
    return <span key={i}>{part}</span>
  })
}

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
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [buttons, setButtons] = useState<TemplateButton[]>([])
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Gestion des boutons
  function addButton(type: TemplateButton['type']) {
    if (buttons.length >= 3) { toast.error('Maximum 3 boutons'); return }
    const base = { URL: { type, text: 'Voir le site', url: 'https://' }, PHONE_NUMBER: { type, text: 'Appeler', phone: '+33' }, COPY_CODE: { type, text: 'Copier le code', code: 'PROMO10' }, QUICK_REPLY: { type, text: 'Oui' } }[type]
    setButtons([...buttons, base as TemplateButton])
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    setButtons(buttons.map((b, idx) => idx === i ? { ...b, ...patch } as TemplateButton : b))
  }
  function removeButton(i: number) { setButtons(buttons.filter((_, idx) => idx !== i)) }

  // Entoure la sélection du textarea avec un marqueur WhatsApp (*gras*, _italique_, ~barré~)
  function wrapSelection(mark: string) {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const sel = bodyText.slice(start, end) || 'texte'
    const next = bodyText.slice(0, start) + mark + sel + mark + bodyText.slice(end)
    setBodyText(next)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 1, start + 1 + sel.length) })
  }

  // Insère la prochaine variable {{n}} à la position du curseur
  function addVariable() {
    const ta = bodyRef.current
    const existing = (bodyText.match(/\{\{(\d+)\}\}/g) || []).map(v => parseInt(v.replace(/\D/g, '')))
    const nextNum = existing.length ? Math.max(...existing) + 1 : 1
    const token = `{{${nextNum}}}`
    if (!ta) { setBodyText(bodyText + token); return }
    const pos = ta.selectionStart
    setBodyText(bodyText.slice(0, pos) + token + bodyText.slice(pos))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos + token.length, pos + token.length) })
  }

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
    setBodyText(''); setHeaderText(''); setFooterText('Powered by Xeyo.io')
    setHeaderType('none'); setHeaderMediaUrl(''); setButtons([])
    setDialogOpen(true)
  }

  function openEdit(t: WhatsAppTemplate) {
    setEditing(t)
    setName(t.name); setLanguage(t.language); setCategory(t.category)
    setBodyText(t.body_text); setHeaderText(t.header_text || ''); setFooterText(t.footer_text || '')
    setHeaderType(t.header_type || (t.header_text ? 'text' : 'none'))
    setHeaderMediaUrl(t.header_media_url || '')
    setButtons(Array.isArray(t.buttons) ? t.buttons : [])
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
        body: JSON.stringify({
          name, language, category,
          body_text: bodyText,
          header_text: headerType === 'text' ? headerText : '',
          footer_text: footerText,
          header_type: headerType,
          header_media_url: (headerType === 'image' || headerType === 'video' || headerType === 'document') ? headerMediaUrl : null,
          buttons: buttons.length > 0 ? buttons : null,
        }),
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

                {/* Aperçu : fond dégradé doux + grande bulle blanche */}
                <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 p-8 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-900">
                  <div className="mx-auto max-w-md">
                    <div className="ml-auto max-w-[92%] overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-md ring-1 ring-black/5">
                      {selectedTemplate.header_type === 'image' && <div className="flex h-36 items-center justify-center bg-slate-200 text-slate-400"><ImageIcon className="h-12 w-12" /></div>}
                      {selectedTemplate.header_type === 'video' && <div className="flex h-36 items-center justify-center bg-slate-800 text-slate-400"><Video className="h-12 w-12" /></div>}
                      {selectedTemplate.header_type === 'document' && <div className="flex items-center gap-2 bg-slate-100 px-3 py-2.5 text-slate-500"><FileText className="h-5 w-5" /><span className="text-xs">Document.pdf</span></div>}
                      <div className="px-4 py-3">
                        {(selectedTemplate.header_type === 'text' || !selectedTemplate.header_type) && selectedTemplate.header_text && (
                          <p className="mb-1 text-[15px] font-semibold text-gray-900">{selectedTemplate.header_text}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug text-gray-800">{renderWhatsAppFormat(selectedTemplate.body_text)}</p>
                        {selectedTemplate.footer_text && (
                          <p className="mt-2 text-[12px] text-gray-400">{selectedTemplate.footer_text}</p>
                        )}
                        <div className="mt-1 text-right text-[10px] text-gray-400">12:00 ✓✓</div>
                      </div>
                      {Array.isArray(selectedTemplate.buttons) && selectedTemplate.buttons.length > 0 && (
                        <div className="border-t border-slate-100">
                          {selectedTemplate.buttons.map((b, i) => (
                            <div key={i} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-[14px] font-medium text-[#1ca5e0] first:border-t-0">
                              {b.type === 'URL' && <ExternalLink className="h-4 w-4" />}
                              {b.type === 'PHONE_NUMBER' && <Phone className="h-4 w-4" />}
                              {b.type === 'COPY_CODE' && <Copy className="h-4 w-4" />}
                              {b.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mx-auto mt-4 max-w-md text-center text-xs text-muted-foreground">
                    {selectedTemplate.variables_count > 0 && `${selectedTemplate.variables_count} variable(s) · `}
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

      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</SheetTitle>
            <SheetDescription>
              Utilisez {'{{1}}'}, {'{{2}}'}… pour les variables (ex : prénom, n° de commande).
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4 pb-6 md:grid-cols-[1fr_300px]">
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
            <div className="space-y-2">
              <Label>En-tête (optionnel)</Label>
              {/* Sélecteur de type d'en-tête */}
              <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1 text-xs">
                {([
                  { v: 'none', l: 'Aucun' },
                  { v: 'text', l: 'Texte' },
                  { v: 'image', l: 'Image' },
                  { v: 'video', l: 'Vidéo' },
                  { v: 'document', l: 'Doc' },
                ] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setHeaderType(v)}
                    className={cn('rounded-md py-1.5 font-medium transition-colors', headerType === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >{l}</button>
                ))}
              </div>
              {headerType === 'text' && (
                <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Votre commande est confirmée" maxLength={60} />
              )}
              {(headerType === 'image' || headerType === 'video' || headerType === 'document') && (
                <Input
                  value={headerMediaUrl}
                  onChange={(e) => setHeaderMediaUrl(e.target.value)}
                  placeholder={headerType === 'image' ? 'URL de l\'image (exemple)' : headerType === 'video' ? 'URL de la vidéo' : 'URL du document'}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Message <span className="text-destructive">*</span></Label>
              <Textarea ref={bodyRef} value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={5}
                placeholder={'Bonjour {{1}}, votre commande #{{2}} est confirmée ! Livraison prévue le {{3}}.'} />
              {/* Barre d'outils : formatage WhatsApp + variable */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{bodyText.length}/1024</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => wrapSelection('*')} title="Gras" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Bold className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => wrapSelection('_')} title="Italique" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Italic className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => wrapSelection('~')} title="Barré" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Strikethrough className="h-3.5 w-3.5" /></button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <button type="button" onClick={addVariable} className="flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted"><Braces className="h-3.5 w-3.5" /> Variable</button>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Pied de page (optionnel)</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Powered by Xeyo.io" maxLength={60} />
            </div>

            {/* Boutons (optionnel) */}
            <div className="space-y-2">
              <Label>Boutons (optionnel)</Label>
              {buttons.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {b.type === 'URL' ? 'Site' : b.type === 'PHONE_NUMBER' ? 'Appel' : b.type === 'COPY_CODE' ? 'Code' : 'Réponse'}
                  </span>
                  <Input value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="Libellé" className="h-8 flex-1" maxLength={25} />
                  {b.type === 'URL' && <Input value={b.url} onChange={(e) => updateButton(i, { url: e.target.value } as Partial<TemplateButton>)} placeholder="https://…" className="h-8 flex-1" />}
                  {b.type === 'PHONE_NUMBER' && <Input value={b.phone} onChange={(e) => updateButton(i, { phone: e.target.value } as Partial<TemplateButton>)} placeholder="+33…" className="h-8 flex-1" />}
                  {b.type === 'COPY_CODE' && <Input value={b.code} onChange={(e) => updateButton(i, { code: e.target.value } as Partial<TemplateButton>)} placeholder="PROMO10" className="h-8 flex-1" />}
                  <button type="button" onClick={() => removeButton(i)} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {buttons.length < 3 && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => addButton('URL')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Visiter le site</button>
                  <button type="button" onClick={() => addButton('PHONE_NUMBER')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Appeler</button>
                  <button type="button" onClick={() => addButton('COPY_CODE')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Copier un code</button>
                  <button type="button" onClick={() => addButton('QUICK_REPLY')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Réponse rapide</button>
                </div>
              )}
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim() || !bodyText.trim()} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Enregistrer' : 'Créer le modèle'}
            </Button>
          </div>

          {/* Aperçu WhatsApp en direct */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Aperçu</Label>
            <div className="rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 p-5 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-900">
              <div className="ml-auto max-w-[88%] overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-md ring-1 ring-black/5">
                {/* Header média */}
                {headerType === 'image' && <div className="flex h-32 items-center justify-center bg-slate-200 text-slate-400"><ImageIcon className="h-10 w-10" /></div>}
                {headerType === 'video' && <div className="flex h-32 items-center justify-center bg-slate-800 text-slate-400"><Video className="h-10 w-10" /></div>}
                {headerType === 'document' && <div className="flex items-center gap-2 bg-slate-100 px-3 py-2.5 text-slate-500"><FileText className="h-5 w-5" /><span className="text-xs">Document.pdf</span></div>}
                <div className="px-3 py-2">
                  {headerType === 'text' && headerText && (
                    <p className="mb-0.5 text-[15px] font-semibold text-gray-900">{headerText}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug text-gray-800">
                    {renderWhatsAppFormat(bodyText) || <span className="text-gray-400">Votre message apparaîtra ici…</span>}
                  </p>
                  {footerText && (
                    <p className="mt-1.5 text-[12px] text-gray-400">{footerText}</p>
                  )}
                  <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00 ✓✓</div>
                </div>
                {/* Boutons */}
                {buttons.length > 0 && (
                  <div className="border-t border-slate-100">
                    {buttons.map((b, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-[14px] font-medium text-[#1ca5e0] first:border-t-0">
                        {b.type === 'URL' && <ExternalLink className="h-4 w-4" />}
                        {b.type === 'PHONE_NUMBER' && <Phone className="h-4 w-4" />}
                        {b.type === 'COPY_CODE' && <Copy className="h-4 w-4" />}
                        {b.text || 'Bouton'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Les variables {'{{1}}'}, {'{{2}}'}… seront remplacées à l&apos;envoi.
            </p>
          </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
