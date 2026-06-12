'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, Trash2, Workflow, ArrowRight, Clock, ShoppingBag, MessageSquare, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import type { WhatsAppTemplate } from '@/types/database'

type Automation = {
  id: string
  name: string
  trigger_event: string
  template_id: string | null
  delay_minutes: number
  quiet_start: number | null
  quiet_end: number | null
  conditions: { min_total?: number; max_total?: number; first_order_only?: boolean }
  is_active: boolean
}

const EVENT_LABEL: Record<string, string> = Object.fromEntries(TRIGGER_EVENTS.map((e) => [e.value, e.label]))

// Présets de délai en minutes (affichage lisible).
const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' },
  { v: 30, l: '30 min' },
  { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' },
  { v: 1440, l: '1 jour' },
  { v: 2880, l: '2 jours' },
  { v: 10080, l: '7 jours' },
]
function delayLabel(min: number): string {
  const p = DELAY_PRESETS.find((d) => d.v === min)
  if (p) return p.l
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} j`
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/automations').then((r) => r.json()),
        fetch('/api/templates').then((r) => r.json()),
      ])
      setAutomations(aRes.data || [])
      setTemplates((tRes.data || []).filter((t: WhatsAppTemplate) => t.status === 'approved'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing({
      id: '', name: '', trigger_event: 'order_fulfilled', template_id: null,
      delay_minutes: 0, quiet_start: null, quiet_end: null, conditions: {}, is_active: true,
    })
    setShowEditor(true)
  }
  function openEdit(a: Automation) { setEditing({ ...a }); setShowEditor(true) }

  async function toggleActive(a: Automation) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !a.is_active }),
      })
      if (!res.ok) throw new Error()
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x))
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  async function remove(a: Automation) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/automations/${a.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setAutomations((prev) => prev.filter((x) => x.id !== a.id))
      toast.success('Automatisation supprimée')
    } catch { toast.error('Erreur') } finally { setBusyId(null) }
  }

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) { toast.error('Donnez un nom à l’automatisation'); return }
    if (!editing.template_id) { toast.error('Choisissez un modèle à envoyer'); return }
    setBusyId('save')
    try {
      const isNew = !editing.id
      const res = await fetch(isNew ? '/api/automations' : `/api/automations/${editing.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await load()
      setShowEditor(false); setEditing(null)
      toast.success(isNew ? 'Automatisation créée' : 'Automatisation modifiée')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') } finally { setBusyId(null) }
  }

  if (loading) return <BlobLoaderScreen />

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Workflow className="h-5 w-5" /> Automatisations</h1>
          <p className="text-sm text-muted-foreground">Envoyez un message automatiquement quand un événement se produit sur votre boutique.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nouvelle</Button>
      </div>

      {automations.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <Workflow className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm mb-4">Aucune automatisation. Créez votre première règle d’envoi automatique.</p>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Créer une automatisation</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const tpl = templates.find((t) => t.id === a.template_id)
            return (
              <div key={a.id} className={cn('rounded-2xl border p-4 transition-colors', a.is_active ? 'bg-card' : 'bg-muted/30')}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{a.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleActive(a)} disabled={busyId === a.id}
                      className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        a.is_active ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground')}
                    >
                      <Power className="h-3 w-3" />{a.is_active ? 'Actif' : 'Inactif'}
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Modifier</Button>
                    <button onClick={() => remove(a)} disabled={busyId === a.id} className="text-destructive hover:opacity-70 p-1.5">
                      {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {/* Chaîne visuelle : Événement → Délai → Modèle */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-blue-600"><ShoppingBag className="h-4 w-4" />{EVENT_LABEL[a.trigger_event] || a.trigger_event}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-amber-600"><Clock className="h-4 w-4" />{delayLabel(a.delay_minutes)}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-2.5 py-1.5 text-green-600"><MessageSquare className="h-4 w-4" />{tpl?.name || 'Modèle supprimé'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Éditeur en blocs */}
      {showEditor && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowEditor(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{editing.id ? 'Modifier' : 'Nouvelle automatisation'}</h2>

            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex : Suivi d’expédition" />
            </div>

            {/* Bloc 1 : Quand */}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-blue-600"><ShoppingBag className="h-4 w-4" />Quand</p>
              <Select value={editing.trigger_event} onValueChange={(v) => setEditing({ ...editing, trigger_event: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGER_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TRIGGER_EVENTS.find((e) => e.value === editing.trigger_event)?.description}</p>
            </div>

            {/* Bloc 2 : Attendre */}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600"><Clock className="h-4 w-4" />Attendre</p>
              <Select value={String(editing.delay_minutes)} onValueChange={(v) => setEditing({ ...editing, delay_minutes: parseInt(v, 10) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DELAY_PRESETS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Bloc 3 : Envoyer */}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-600"><MessageSquare className="h-4 w-4" />Envoyer le modèle</p>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun modèle approuvé. Créez et faites approuver un modèle d’abord.</p>
              ) : (
                <Select value={editing.template_id || ''} onValueChange={(v) => setEditing({ ...editing, template_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>

            {/* Bloc 4 : Conditions (optionnel) */}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Conditions (optionnel)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Montant min (€)</Label>
                  <Input type="number" value={editing.conditions.min_total ?? ''} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, min_total: e.target.value ? parseFloat(e.target.value) : undefined } })} placeholder="—" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Montant max (€)</Label>
                  <Input type="number" value={editing.conditions.max_total ?? ''} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, max_total: e.target.value ? parseFloat(e.target.value) : undefined } })} placeholder="—" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.conditions.first_order_only} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, first_order_only: e.target.checked } })} />
                Uniquement la première commande du client
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowEditor(false)}>Annuler</Button>
              <Button onClick={save} disabled={busyId === 'save'}>
                {busyId === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {editing.id ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
