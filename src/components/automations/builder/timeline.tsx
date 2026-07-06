'use client'

import React, { useState, useEffect } from 'react'
import { Clock, GitBranch, MessageSquare, Plus, ShoppingBag, Trash2, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChevronDown } from 'lucide-react'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS, COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from './field-labels'
import { chainFrom, getNode } from './timeline-model'
import { TemplateBubble } from '@/components/template-bubble'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'

const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' }, { v: 30, l: '30 min' }, { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' }, { v: 1440, l: '1 jour' }, { v: 2880, l: '2 jours' }, { v: 10080, l: '7 jours' },
]

// Produits / collections de la boutique (titres) — chargés une seule fois et
// partagés par tous les blocs condition (listes déroulantes des conditions).
const listCache: Record<string, { title: string }[]> = {}
const listPromise: Record<string, Promise<{ title: string }[]>> = {}
function useShopList(endpoint: string): { title: string }[] {
  const [items, setItems] = useState<{ title: string }[]>(listCache[endpoint] || [])
  useEffect(() => {
    if (listCache[endpoint]) return
    if (!listPromise[endpoint]) {
      listPromise[endpoint] = fetch(endpoint)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j): { title: string }[] => { const list = Array.isArray(j.data) ? j.data : []; listCache[endpoint] = list; return list })
        .catch((): { title: string }[] => { listCache[endpoint] = []; return [] })
    }
    listPromise[endpoint].then((p) => setItems(p))
  }, [endpoint])
  return items
}

type InsertKind = 'delay' | 'condition' | 'action' | 'ab_test'

type TimelineProps = {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  onPatch: (id: string, patch: Partial<WorkflowNode>) => void
  onInsert: (afterId: string, kind: InsertKind, branch?: string) => void
  onDelete: (id: string) => void
  onSelectAction: (templateId: string | null) => void
  onAddVariant?: (nodeId: string) => void
  onRemoveVariant?: (nodeId: string, key: string) => void
  automationId?: string | null
}

/**
 * Timeline verticale fixe (style Loops.so). Blocs colorés "remplis" avec leur
 * contenu éditable directement dedans (selects). Boutons "+" entre les blocs.
 * Les conditions se séparent en deux colonnes Oui / Non, puis se referment.
 */
export function Timeline(props: TimelineProps) {
  const trigger = props.graph.nodes.find((n) => n.type === 'trigger')
  if (!trigger) return null

  return (
    <div className="flex flex-col items-center py-2">
      <TriggerBlock node={trigger} onPatch={props.onPatch} />
      <Branch {...props} fromId={trigger.id} />
    </div>
  )
}

// Couleurs des colonnes de variantes A/B/C/D.
const VARIANT_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899']

function Branch(props: TimelineProps & { fromId: string; branch?: string }) {
  const { graph, fromId, branch, templates, onPatch, onInsert, onDelete, onSelectAction } = props
  const chain = chainFrom(graph, fromId, branch)
  return (
    <>
      <Inserter onInsert={(kind) => onInsert(fromId, kind, branch)} />
      {chain.map((id, i) => {
        const node = getNode(graph, id)
        if (!node) return null

        if (node.type === 'delay') return (
          <React.Fragment key={id}>
            <DelayBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)} />
            <Inserter onInsert={(kind) => onInsert(id, kind)} />
          </React.Fragment>
        )

        if (node.type === 'action') return (
          <React.Fragment key={id}>
            <ActionBlock node={node} templates={templates} onPatch={onPatch} onDelete={() => onDelete(id)} onSelectAction={onSelectAction} />
            {i === chain.length - 1 && <Inserter onInsert={(kind) => onInsert(id, kind)} />}
          </React.Fragment>
        )

        if (node.type === 'condition') return (
          <React.Fragment key={id}>
            <ConditionBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)} />
            <div className="mt-1 flex w-full items-start justify-center gap-6">
              <BranchCol label="Oui" color="#22C55E">
                <Branch {...props} fromId={id} branch="yes" />
              </BranchCol>
              <BranchCol label="Non" color="#EF4444">
                <Branch {...props} fromId={id} branch="no" />
              </BranchCol>
            </div>
          </React.Fragment>
        )

        if (node.type === 'ab_test') return (
          <React.Fragment key={id}>
            <ABTestBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)}
              onAddVariant={props.onAddVariant} onRemoveVariant={props.onRemoveVariant}
              automationId={props.automationId} />
            <div className="mt-1 flex w-full items-start justify-center gap-4">
              {node.variants.map((v, vi) => (
                <BranchCol key={v.key} label={`${v.key} · ${v.weight}%`} color={VARIANT_COLORS[vi % 4]}>
                  <Branch {...props} fromId={id} branch={`variant:${v.key}`} />
                </BranchCol>
              ))}
            </div>
          </React.Fragment>
        )
        return null
      })}
    </>
  )
}

// ---- Blocs colorés "remplis" (style de l'ancien éditeur) --------------------

function Shell({ tone, icon, kind, onDelete, children }: {
  tone: { text: string; tint: string }
  icon: React.ReactNode; kind: string; onDelete?: () => void; children: React.ReactNode
}) {
  return (
    <>
      <Connector />
      <div data-block className="liquid-glass group relative w-72 rounded-2xl p-3" style={{ ['--lg-tint' as string]: tone.tint }}>
        <div className="mb-2 flex items-center gap-1.5">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-current/10', tone.text)}>{icon}</span>
          <span className={cn('text-sm font-medium', tone.text)}>{kind}</span>
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} title="Supprimer ce bloc"
              className="ml-auto rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </>
  )
}

const TONE = {
  blue: { text: 'text-blue-600', tint: '#3B82F6' },
  amber: { text: 'text-amber-600', tint: '#F59E0B' },
  green: { text: 'text-green-600', tint: '#22C55E' },
  violet: { text: 'text-violet-600', tint: '#8B5CF6' },
}

function TriggerBlock({ node, onPatch }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void }) {
  if (node.type !== 'trigger') return null
  return (
    <div data-block className="liquid-glass relative w-72 rounded-2xl p-3" style={{ ['--lg-tint' as string]: TONE.blue.tint }}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-current/10', TONE.blue.text)}><ShoppingBag className="h-4 w-4" /></span>
        <span className={cn('text-sm font-medium', TONE.blue.text)}>Quand</span>
      </div>
      <Select value={node.event} onValueChange={(v) => onPatch(node.id, { event: v as never })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{TRIGGER_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">{TRIGGER_EVENTS.find((e) => e.value === node.event)?.description}</p>

      {/* Paramètres spécifiques aux triggers temporels */}
      {node.event === 'no_customer_reply' && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Sans réponse depuis</p>
          <Select value={String(node.inactivityHours ?? 24)} onValueChange={(v) => onPatch(node.id, { inactivityHours: parseInt(v, 10) } as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 heure</SelectItem>
              <SelectItem value="3">3 heures</SelectItem>
              <SelectItem value="12">12 heures</SelectItem>
              <SelectItem value="24">1 jour</SelectItem>
              <SelectItem value="48">2 jours</SelectItem>
              <SelectItem value="72">3 jours</SelectItem>
              <SelectItem value="168">7 jours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {node.event === 'scheduled_date' && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Date et heure d’envoi</p>
          <Input type="datetime-local"
            value={node.scheduledAt ? node.scheduledAt.slice(0, 16) : ''}
            onChange={(e) => onPatch(node.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined } as never)} />
        </div>
      )}
      {node.event === 'customer_birthday' && (
        <p className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
          Envoyé le jour de l’anniversaire (si la date est connue dans la fiche du client).
        </p>
      )}
      {node.event === 'button_clicked' && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Libellé du bouton (laisser vide = tout bouton)</p>
          <Input
            placeholder="Ex : Suivre ma commande"
            value={node.buttonText ?? ''}
            onChange={(e) => onPatch(node.id, { buttonText: e.target.value } as never)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se déclenche quand le client clique sur un bouton « réponse rapide » portant ce texte.
          </p>
        </div>
      )}
    </div>
  )
}

function DelayBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  if (node.type !== 'delay') return null
  return (
    <Shell tone={TONE.amber} icon={<Clock className="h-4 w-4" />} kind="Attendre" onDelete={onDelete}>
      <Select value={String(node.minutes)} onValueChange={(v) => onPatch(node.id, { minutes: parseInt(v, 10) } as never)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{DELAY_PRESETS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
      </Select>
    </Shell>
  )
}

function ActionBlock({ node, templates, onPatch, onDelete, onSelectAction }: {
  node: WorkflowNode; templates: WhatsAppTemplate[]
  onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void; onSelectAction: (t: string | null) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCat, setPickerCat] = useState<string>('all')
  if (node.type !== 'action') return null
  const selected = templates.find((t) => t.id === node.templateId) || null
  const badge = (t: WhatsAppTemplate) =>
    t.template_type === 'carousel' ? '🎠 Carrousel'
    : t.template_type === 'limited_time_offer' ? '🏷️ Offre limitée'
    : '💬 Message'
  const labelsFor = (t: WhatsAppTemplate) => (t.variable_keys || []).map((k) => VARIABLE_BY_KEY[k]?.label || k)

  return (
    <Shell tone={TONE.green} icon={<MessageSquare className="h-4 w-4" />} kind="Envoyer le modèle" onDelete={onDelete}>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun modèle approuvé.</p>
      ) : (
        <div className="space-y-2">
          {/* Sélecteur VISUEL : ouvre une galerie de bulles de message. */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-foreground/30">
                <span className={cn('truncate', selected ? 'font-medium' : 'text-muted-foreground')}>
                  {selected ? selected.name : 'Choisir un modèle'}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[540px] max-w-[92vw] overscroll-contain p-2"
              onWheel={(e) => e.stopPropagation()}
            >
              <p className="px-1 pb-2 pt-1 text-[11px] font-medium text-muted-foreground">Choisir un modèle</p>

              {/* Filtre par catégorie (puces) */}
              {(() => {
                const CATS: { key: string; label: string }[] = [
                  { key: 'all', label: 'Tous' },
                  { key: 'order_status', label: 'Commande' },
                  { key: 'cart', label: 'Panier' },
                  { key: 'marketing', label: 'Marketing' },
                  { key: 'support', label: 'SAV' },
                  { key: 'billing', label: 'Facturation' },
                ]
                // On n'affiche que les catégories qui ont au moins un modèle.
                const present = new Set(templates.map((t) => (t as { use_case?: string }).use_case || 'other'))
                const cats = CATS.filter((c) => c.key === 'all' || present.has(c.key))
                return (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {cats.map((c) => (
                      <button key={c.key} onClick={() => setPickerCat(c.key)}
                        className={cn('rounded-full px-2.5 py-1 text-[11px] transition-colors',
                          pickerCat === c.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {/* Bulles en défilement HORIZONTAL (le scroll reste dans la galerie). */}
              <div
                className="flex gap-2 overflow-x-auto overscroll-contain pb-1 [scrollbar-width:thin]"
                onWheel={(e) => {
                  // Convertit le scroll vertical de la molette en scroll horizontal.
                  if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; e.stopPropagation() }
                }}
              >
                {templates
                  .filter((t) => pickerCat === 'all' || (t as { use_case?: string }).use_case === pickerCat)
                  .map((t) => {
                    const isSel = t.id === node.templateId
                    return (
                      <button
                        key={t.id}
                        onClick={() => { onPatch(node.id, { templateId: t.id } as never); onSelectAction(t.id); setPickerOpen(false) }}
                        className={cn(
                          'w-[230px] shrink-0 rounded-xl border p-2.5 text-left transition-colors',
                          isSel ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-foreground/30 hover:bg-muted/40'
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{t.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{badge(t)}</span>
                        </div>
                        {/* Aperçu grand : on voit le message en entier (scroll interne
                            si vraiment très long). */}
                        <div className="max-h-[360px] overflow-y-auto [scrollbar-width:thin]">
                          <TemplateBubble template={t} labels={labelsFor(t)} />
                        </div>
                      </button>
                    )
                  })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Aperçu du modèle sélectionné directement dans le nœud. */}
          {selected && (
            <div>
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">{badge(selected)}</div>
              <TemplateBubble template={selected} labels={labelsFor(selected)} />
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function ConditionBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  const products = useShopList('/api/shopify/products')
  const collections = useShopList('/api/shopify/collections')
  if (node.type !== 'condition') return null
  const rule = node.rule
  const nodeId = node.id
  const field = CONDITION_FIELDS.find((f) => f.value === rule.field) || CONDITION_FIELDS[0]
  const setValue = (value: string | number | boolean) => onPatch(nodeId, { rule: { ...rule, value } } as never)

  // Choix de l'éditeur de VALEUR selon la source du champ.
  function valueEditor() {
    if (field.valueType === 'boolean') {
      return (
        <Select value={String(rule.value)} onValueChange={(v) => setValue(v === 'true')}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent>
        </Select>
      )
    }
    if (field.source === 'country' || field.source === 'language') {
      const options = field.source === 'country' ? COUNTRY_OPTIONS : LANGUAGE_OPTIONS
      return (
        <Select value={String(rule.value ?? '')} onValueChange={setValue}>
          <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={field.source === 'country' ? 'Choisir un pays' : 'Choisir une langue'} /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      )
    }
    if (field.source === 'product' || field.source === 'collection') {
      // La valeur stockée reste le TITRE (la condition fait « commande contient ce titre »).
      const items = field.source === 'product' ? products : collections
      const ph = field.source === 'product' ? 'Choisir un produit' : 'Choisir une collection'
      return items.length > 0 ? (
        <Select value={String(rule.value ?? '')} onValueChange={setValue}>
          <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={ph} /></SelectTrigger>
          <SelectContent>{items.map((it, i) => <SelectItem key={i} value={it.title}><span className="block max-w-[220px] truncate">{it.title}</span></SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input className="flex-1" placeholder={ph} value={String(rule.value ?? '')} onChange={(e) => setValue(e.target.value)} />
      )
    }
    // Saisie libre (nombre / texte) — collection, montant…
    return (
      <Input className="flex-1" type={field.valueType === 'number' ? 'number' : 'text'} placeholder={field.placeholder}
        value={String(rule.value ?? '')}
        onChange={(e) => setValue(field.valueType === 'number' ? parseFloat(e.target.value) : e.target.value)} />
    )
  }

  return (
    <Shell tone={TONE.violet} icon={<GitBranch className="h-4 w-4" />} kind="Si (condition)" onDelete={onDelete}>
      <div className="space-y-2">
        <Select value={rule.field} onValueChange={(v) => {
          const f = CONDITION_FIELDS.find((x) => x.value === v)!
          onPatch(nodeId, { rule: { field: v as never, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' } } as never)
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={rule.op} onValueChange={(v) => onPatch(nodeId, { rule: { ...rule, op: v as never } } as never)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{field.ops.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
          </Select>
          {valueEditor()}
        </div>
      </div>
    </Shell>
  )
}

// ---- Connecteurs / inserts --------------------------------------------------

function Connector() {
  return <div className="h-4 w-px bg-border" />
}

function BranchCol({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}1a`, color }}>{label}</span>
      {children}
    </div>
  )
}

function Inserter({ onInsert }: { onInsert: (kind: InsertKind) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <button onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary">
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-7 z-20 flex gap-1 rounded-xl border bg-card p-1 shadow-lg">
            <MenuItem className="text-amber-600" icon={<Clock className="h-3.5 w-3.5" />} label="Délai" onClick={() => { onInsert('delay'); setOpen(false) }} />
            <MenuItem className="text-violet-600" icon={<GitBranch className="h-3.5 w-3.5" />} label="Condition" onClick={() => { onInsert('condition'); setOpen(false) }} />
            <MenuItem className="text-blue-600" icon={<FlaskConical className="h-3.5 w-3.5" />} label="Test A/B" onClick={() => { onInsert('ab_test'); setOpen(false) }} />
            <MenuItem className="text-green-600" icon={<MessageSquare className="h-3.5 w-3.5" />} label="Message" onClick={() => { onInsert('action'); setOpen(false) }} />
          </div>
        </>
      )}
    </div>
  )
}

// ---- Bloc Test A/B ----------------------------------------------------------
type ABVariantResult = { key: string; sent: number; responseRate: number; orderRate: number }

function ABTestBlock({ node, onPatch, onDelete, onAddVariant, onRemoveVariant, automationId }: {
  node: WorkflowNode
  onPatch: (id: string, p: Partial<WorkflowNode>) => void
  onDelete: () => void
  onAddVariant?: (nodeId: string) => void
  onRemoveVariant?: (nodeId: string, key: string) => void
  automationId?: string | null
}) {
  const [results, setResults] = useState<{ variants: ABVariantResult[]; winner: string | null } | null>(null)
  const [showResults, setShowResults] = useState(false)
  const nodeId = node.type === 'ab_test' ? node.id : ''

  useEffect(() => {
    if (!showResults || !automationId || !nodeId) return
    let active = true
    fetch(`/api/automations/${automationId}/ab-results`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!active || !json?.data) return
        const n = json.data.nodes.find((x: { nodeId: string }) => x.nodeId === nodeId)
        setResults(n ? { variants: n.variants, winner: n.winner } : { variants: [], winner: null })
      })
      .catch(() => {})
    return () => { active = false }
  }, [showResults, automationId, nodeId])

  if (node.type !== 'ab_test') return null
  const total = node.variants.reduce((s, v) => s + (Number(v.weight) || 0), 0)
  const setWeight = (key: string, w: number) => {
    const variants = node.variants.map((v) => v.key === key ? { ...v, weight: Math.max(0, Math.min(100, w)) } : v)
    onPatch(node.id, { variants } as Partial<WorkflowNode>)
  }
  return (
    <Shell tone={TONE.blue} icon={<FlaskConical className="h-4 w-4" />} kind="Test A/B" onDelete={onDelete}>
      <p className="mb-2 text-xs text-muted-foreground">Répartit les contacts entre les variantes. Chaque variante a son propre message.</p>
      <div className="space-y-1.5">
        {node.variants.map((v, i) => (
          <div key={v.key} className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: `${VARIANT_COLORS[i % 4]}1a`, color: VARIANT_COLORS[i % 4] }}>{v.key}</span>
            <input type="number" min={0} max={100} value={v.weight}
              onChange={(e) => setWeight(v.key, parseInt(e.target.value, 10) || 0)}
              className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm" />
            <span className="text-xs text-muted-foreground">%</span>
            {node.variants.length > 2 && onRemoveVariant && (
              <button onClick={() => onRemoveVariant(node.id, v.key)} title="Retirer cette variante"
                className="ml-auto rounded p-1 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('text-[11px] font-medium', total === 100 ? 'text-muted-foreground' : 'text-destructive')}>
          Total : {total}% {total !== 100 && '(doit faire 100 %)'}
        </span>
        {node.variants.length < 4 && onAddVariant && (
          <button onClick={() => onAddVariant(node.id)} className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700">
            <Plus className="h-3 w-3" /> Variante
          </button>
        )}
      </div>

      {/* Résultats (si l'automation est enregistrée) */}
      {automationId && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <button onClick={() => setShowResults((s) => !s)} className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <span>📊 Résultats</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showResults && 'rotate-180')} />
          </button>
          {showResults && (
            <div className="mt-2 space-y-1.5">
              {!results ? (
                <p className="text-[11px] text-muted-foreground">Chargement…</p>
              ) : results.variants.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Aucune donnée pour l&apos;instant (les envois apparaîtront ici).</p>
              ) : results.variants.map((v, i) => (
                <div key={v.key} className={cn('rounded-lg border p-2', results.winner === v.key ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/60')}>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: `${VARIANT_COLORS[i % 4]}1a`, color: VARIANT_COLORS[i % 4] }}>{v.key}</span>
                    {results.winner === v.key && <span className="rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-semibold text-emerald-500">Gagnant</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{v.sent} envoi{v.sent > 1 ? 's' : ''}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px]">
                    <span className="text-muted-foreground">Réponse : <span className="font-semibold text-foreground">{v.responseRate}%</span></span>
                    <span className="text-muted-foreground">Commande : <span className="font-semibold text-foreground">{v.orderRate}%</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function MenuItem({ className, icon, label, onClick }: { className?: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted', className)}>
      {icon}{label}
    </button>
  )
}