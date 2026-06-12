'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, Trash2, Workflow, Clock, ShoppingBag, MessageSquare, Power, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import type { WhatsAppTemplate } from '@/types/database'
import { PhonePreview } from '@/components/automations/phone-preview'

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

const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' }, { v: 30, l: '30 min' }, { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' }, { v: 1440, l: '1 jour' }, { v: 2880, l: '2 jours' }, { v: 10080, l: '7 jours' },
]
function delayLabel(min: number): string {
  const p = DELAY_PRESETS.find((d) => d.v === min)
  if (p) return p.l
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} j`
}

// Résumé lisible des conditions (pour la bulle système de l'aperçu).
function conditionsSummary(c: Automation['conditions']): string | undefined {
  const parts: string[] = []
  if (c.min_total != null) parts.push(`montant ≥ ${c.min_total}€`)
  if (c.max_total != null) parts.push(`montant ≤ ${c.max_total}€`)
  if (c.first_order_only) parts.push('1ʳᵉ commande')
  return parts.length ? parts.join(' · ') : undefined
}

// Échantillons pour l'aperçu : valeurs des variables nommées du template.
function templateSamples(tpl?: WhatsAppTemplate): string[] {
  if (!tpl) return []
  const keys = (tpl.variable_keys as string[]) || []
  if (keys.length > 0) return keys.map((k) => VARIABLE_BY_KEY[k]?.sample || 'exemple')
  return (tpl.sample_values as string[]) || []
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [storeName, setStoreName] = useState('Votre boutique')
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

  const editTpl = editing ? templates.find((t) => t.id === editing.template_id) : undefined

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5">
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
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn('rounded-2xl border p-4 transition-colors', a.is_active ? 'bg-card' : 'bg-muted/30 opacity-80')}
              >
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
                    <button onClick={() => remove(a)} disabled={busyId === a.id} className="p-1.5 text-destructive hover:opacity-70">
                      {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {/* Flow horizontal : Événement ●──▶ Délai ●──▶ Modèle */}
                <FlowChain
                  active={a.is_active}
                  event={EVENT_LABEL[a.trigger_event] || a.trigger_event}
                  delay={delayLabel(a.delay_minutes)}
                  template={tpl?.name || 'Modèle supprimé'}
                />
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Éditeur : construction (gauche) + téléphone live (droite) */}
      <AnimatePresence>
        {showEditor && editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowEditor(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="grid w-full max-w-3xl gap-5 rounded-2xl bg-background p-5 shadow-2xl md:grid-cols-[1fr_300px] max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Colonne construction */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{editing.id ? 'Modifier' : 'Nouvelle automatisation'}</h2>
                  <button onClick={() => setShowEditor(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>

                <div className="space-y-1.5">
                  <Label>Nom</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex : Suivi d’expédition" />
                </div>

                <StepBlock color="blue" icon={<ShoppingBag className="h-4 w-4" />} title="Quand" step={1}>
                  <Select value={editing.trigger_event} onValueChange={(v) => setEditing({ ...editing, trigger_event: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRIGGER_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">{TRIGGER_EVENTS.find((e) => e.value === editing.trigger_event)?.description}</p>
                </StepBlock>

                <StepBlock color="amber" icon={<Clock className="h-4 w-4" />} title="Attendre" step={2}>
                  <Select value={String(editing.delay_minutes)} onValueChange={(v) => setEditing({ ...editing, delay_minutes: parseInt(v, 10) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DELAY_PRESETS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
                  </Select>
                </StepBlock>

                <StepBlock color="green" icon={<MessageSquare className="h-4 w-4" />} title="Envoyer le modèle" step={3}>
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun modèle approuvé. Créez et faites approuver un modèle d’abord.</p>
                  ) : (
                    <Select value={editing.template_id || ''} onValueChange={(v) => setEditing({ ...editing, template_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
                      <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </StepBlock>

                <StepBlock color="slate" icon={<span className="text-xs">⚙</span>} title="Conditions (optionnel)" step={4}>
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
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.conditions.first_order_only} onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, first_order_only: e.target.checked } })} />
                    Uniquement la première commande
                  </label>
                </StepBlock>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setShowEditor(false)}>Annuler</Button>
                  <Button onClick={save} disabled={busyId === 'save'}>
                    {busyId === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    {editing.id ? 'Enregistrer' : 'Créer'}
                  </Button>
                </div>
              </div>

              {/* Colonne aperçu téléphone */}
              <div className="hidden md:flex md:items-start md:justify-center md:pt-2">
                {editTpl ? (
                  <PhonePreview
                    storeName={storeName}
                    eventLabel={EVENT_LABEL[editing.trigger_event] || editing.trigger_event}
                    conditionsText={conditionsSummary(editing.conditions)}
                    delayLabel={delayLabel(editing.delay_minutes)}
                    headerText={editTpl.header_text || undefined}
                    bodyText={editTpl.body_text}
                    footerText={editTpl.footer_text || undefined}
                    samples={templateSamples(editTpl)}
                    mediaType={editTpl.header_type}
                    mediaUrl={undefined}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                    Choisissez un modèle pour voir l’aperçu du message.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Bloc d'étape numéroté et coloré. */
function StepBlock({ color, icon, title, step, children }: {
  color: 'blue' | 'amber' | 'green' | 'slate'
  icon: React.ReactNode
  title: string
  step: number
  children: React.ReactNode
}) {
  const tone = {
    blue: 'text-blue-600 border-blue-500/30 bg-blue-500/5',
    amber: 'text-amber-600 border-amber-500/30 bg-amber-500/5',
    green: 'text-green-600 border-green-500/30 bg-green-500/5',
    slate: 'text-muted-foreground border-border bg-muted/30',
  }[color]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: step * 0.05 }}
      className={cn('rounded-xl border p-3', tone)}
    >
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10">{icon}</span>
        {title}
      </p>
      {children}
    </motion.div>
  )
}

/** Chaîne visuelle Événement ●──▶ Délai ●──▶ Modèle, avec point animé si actif. */
function FlowChain({ active, event, delay, template }: { active: boolean; event: string; delay: string; template: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
      <Node color="blue" icon={<ShoppingBag className="h-3.5 w-3.5" />} label={event} />
      <Connector active={active} />
      <Node color="amber" icon={<Clock className="h-3.5 w-3.5" />} label={delay} />
      <Connector active={active} />
      <Node color="green" icon={<MessageSquare className="h-3.5 w-3.5" />} label={template} />
    </div>
  )
}

function Node({ color, icon, label }: { color: 'blue' | 'amber' | 'green'; icon: React.ReactNode; label: string }) {
  const tone = { blue: 'bg-blue-500/10 text-blue-600', amber: 'bg-amber-500/10 text-amber-600', green: 'bg-green-500/10 text-green-600' }[color]
  return <span className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5', tone)}>{icon}{label}</span>
}

/** Connecteur avec un point lumineux qui circule (si actif). */
function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative h-px w-7 bg-border">
      {active && (
        <motion.span
          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]"
          initial={{ left: '0%' }}
          animate={{ left: ['0%', '100%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}
