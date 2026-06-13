'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Loader2, Trash2, Send, FormInput, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import type { WhatsAppFlow, FlowScreen, FlowField, FlowFieldType } from '@/types/database'

const FIELD_TYPES: { value: FlowFieldType; label: string }[] = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'radio', label: 'Choix unique' },
  { value: 'checkbox', label: 'Choix multiple' },
  { value: 'dropdown', label: 'Liste déroulante' },
]
const HAS_OPTIONS = (t: FlowFieldType) => t === 'radio' || t === 'checkbox' || t === 'dropdown'

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
  published: { label: 'Publié', cls: 'bg-green-500/15 text-green-500' },
}

let _seq = 0
const newId = (p: string) => `${p}_${++_seq}_${p.length}`

export default function FlowsPage() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form
  const [name, setName] = useState('')
  const [ctaText, setCtaText] = useState('Ouvrir le formulaire')
  const [bodyText, setBodyText] = useState('')
  const [screens, setScreens] = useState<FlowScreen[]>([])
  const editing = flows.find((f) => f.id === selectedId) || null

  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch('/api/flows')
      const json = await res.json()
      if (res.ok) setFlows(json.data || [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchFlows() }, [fetchFlows])

  function openCreate() {
    setSelectedId(null)
    setName(''); setCtaText('Ouvrir le formulaire'); setBodyText('Merci de remplir ce court formulaire 👇')
    setScreens([{ id: newId('screen'), title: 'Informations', fields: [{ name: 'nom', label: 'Votre nom', type: 'text', required: true }] }])
  }
  function openEdit(f: WhatsAppFlow) {
    setSelectedId(f.id)
    setName(f.name); setCtaText(f.cta_text); setBodyText(f.body_text)
    setScreens(Array.isArray(f.screens) ? f.screens : [])
  }

  // ── Édition des écrans / champs ──────────────────────────────────────────
  function patchScreen(si: number, patch: Partial<FlowScreen>) {
    setScreens((arr) => arr.map((s, i) => (i === si ? { ...s, ...patch } : s)))
  }
  function addScreen() {
    if (screens.length >= 8) { toast.error('Maximum 8 écrans'); return }
    setScreens((arr) => [...arr, { id: newId('screen'), title: `Écran ${arr.length + 1}`, fields: [] }])
  }
  function removeScreen(si: number) { setScreens((arr) => arr.filter((_, i) => i !== si)) }

  function addField(si: number) {
    patchScreen(si, { fields: [...screens[si].fields, { name: `champ_${screens[si].fields.length + 1}`, label: 'Nouveau champ', type: 'text', required: false }] })
  }
  function patchField(si: number, fi: number, patch: Partial<FlowField>) {
    patchScreen(si, { fields: screens[si].fields.map((f, i) => (i === fi ? { ...f, ...patch } : f)) })
  }
  function removeField(si: number, fi: number) {
    patchScreen(si, { fields: screens[si].fields.filter((_, i) => i !== fi) })
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/flows/${editing.id}` : '/api/flows'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cta_text: ctaText, body_text: bodyText, screens }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchFlows()
      if (json.data?.id) setSelectedId(json.data.id)
      toast.success(editing ? 'Formulaire enregistré' : 'Formulaire créé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setSaving(false) }
  }

  async function handlePublish(f: WhatsAppFlow) {
    setBusyId(f.id)
    try {
      const res = await fetch(`/api/flows/${f.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchFlows()
      toast.success('Formulaire publié — utilisable dans les conversations')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setBusyId(null) }
  }

  async function handleDelete(f: WhatsAppFlow) {
    setBusyId(f.id)
    try {
      const res = await fetch(`/api/flows/${f.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      await fetchFlows()
      if (selectedId === f.id) { setSelectedId(null); setScreens([]); setName('') }
      toast.success('Formulaire supprimé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setBusyId(null) }
  }

  if (loading) return <BlobLoaderScreen />
  const showForm = selectedId !== null || (name !== '' || screens.length > 0)

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Formulaires (Flows)</h1>
          <p className="text-sm text-muted-foreground">Formulaires multi-écrans interactifs envoyés dans WhatsApp (contact, avis, prise de RDV…).</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau formulaire</Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[300px_1fr]">
        {/* Liste */}
        <div className="space-y-1.5 overflow-y-auto rounded-xl border p-2">
          {flows.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Aucun formulaire.</p>
          ) : flows.map((f) => {
            const st = STATUS_STYLE[f.status] || STATUS_STYLE.draft
            return (
              <button key={f.id} onClick={() => openEdit(f)}
                className={cn('w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selectedId === f.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <span className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px]', st.cls)}>{st.label}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{(f.screens || []).length} écran(s)</div>
              </button>
            )
          })}
        </div>

        {/* Éditeur */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
          {showForm ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-sm font-medium">{editing ? 'Modifier le formulaire' : 'Nouveau formulaire'}</span>
                <div className="flex items-center gap-1.5">
                  {editing && editing.status === 'draft' && (
                    <Button size="sm" variant="outline" disabled={busyId === editing.id} onClick={() => handlePublish(editing)}>
                      {busyId === editing.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                      Publier
                    </Button>
                  )}
                  <Button size="sm" disabled={saving || !name.trim()} onClick={handleSave}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{editing ? 'Enregistrer' : 'Créer'}
                  </Button>
                  {editing && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busyId === editing.id} onClick={() => handleDelete(editing)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nom interne</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Formulaire de contact" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Texte du bouton (CTA)</Label>
                    <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Ouvrir le formulaire" maxLength={30} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Message d&apos;accompagnement</Label>
                  <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={2} placeholder="Merci de remplir ce court formulaire 👇" />
                </div>

                {/* Écrans */}
                {screens.map((screen, si) => (
                  <div key={screen.id} className="space-y-3 rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      <Input value={screen.title} onChange={(e) => patchScreen(si, { title: e.target.value })} className="h-8 flex-1 font-medium" placeholder={`Écran ${si + 1}`} />
                      {screens.length > 1 && (
                        <button type="button" onClick={() => removeScreen(si)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    {screen.fields.map((field, fi) => (
                      <div key={fi} className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center gap-2">
                          <Input value={field.label} onChange={(e) => patchField(si, fi, { label: e.target.value })} className="h-8 flex-1" placeholder="Libellé du champ" />
                          <Select value={field.type} onValueChange={(v) => patchField(si, fi, { type: v as FlowFieldType })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <button type="button" onClick={() => removeField(si, fi)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input value={field.name} onChange={(e) => patchField(si, fi, { name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} className="h-7 flex-1 text-xs" placeholder="nom_technique" />
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" checked={field.required} onChange={(e) => patchField(si, fi, { required: e.target.checked })} />
                            Obligatoire
                          </label>
                        </div>
                        {HAS_OPTIONS(field.type) && (
                          <Input
                            value={(field.options || []).join(', ')}
                            onChange={(e) => patchField(si, fi, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                            className="h-8 text-xs" placeholder="Options séparées par des virgules : Oui, Non, Peut-être"
                          />
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => addField(si)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un champ
                    </Button>
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" onClick={addScreen} disabled={screens.length >= 8}>
                  <Plus className="mr-1 h-4 w-4" /> Ajouter un écran ({screens.length}/8)
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <FormInput className="h-8 w-8 opacity-50" />
              <p>Sélectionnez un formulaire ou créez-en un.</p>
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau formulaire</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
