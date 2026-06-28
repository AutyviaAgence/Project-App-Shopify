'use client'

import React, { useState } from 'react'
import { Clock, GitBranch, MessageSquare, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS } from './field-labels'
import { chainFrom, getNode } from './timeline-model'
import { TemplateBubble } from '@/components/template-bubble'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'

const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' }, { v: 30, l: '30 min' }, { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' }, { v: 1440, l: '1 jour' }, { v: 2880, l: '2 jours' }, { v: 10080, l: '7 jours' },
]

type TimelineProps = {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  onPatch: (id: string, patch: Partial<WorkflowNode>) => void
  onInsert: (afterId: string, kind: 'delay' | 'condition' | 'action', branch?: 'yes' | 'no') => void
  onDelete: (id: string) => void
  onSelectAction: (templateId: string | null) => void
}

/**
 * Timeline verticale fixe (style Loops.so). Blocs colorés "remplis" avec leur
 * contenu éditable directement dedans (selects). Boutons "+" entre les blocs.
 * Les conditions se séparent en deux colonnes Oui / Non, puis se referment.
 */
export function Timeline({ graph, templates, onPatch, onInsert, onDelete, onSelectAction }: TimelineProps) {
  const trigger = graph.nodes.find((n) => n.type === 'trigger')
  if (!trigger) return null

  return (
    <div className="flex flex-col items-center py-2">
      <TriggerBlock node={trigger} onPatch={onPatch} />
      <Branch graph={graph} fromId={trigger.id} templates={templates} onPatch={onPatch} onInsert={onInsert} onDelete={onDelete} onSelectAction={onSelectAction} />
    </div>
  )
}

function Branch({
  graph, fromId, branch, templates, onPatch, onInsert, onDelete, onSelectAction,
}: TimelineProps & { fromId: string; branch?: 'yes' | 'no' }) {
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
                <Branch graph={graph} fromId={id} branch="yes" templates={templates} onPatch={onPatch} onInsert={onInsert} onDelete={onDelete} onSelectAction={onSelectAction} />
              </BranchCol>
              <BranchCol label="Non" color="#EF4444">
                <Branch graph={graph} fromId={id} branch="no" templates={templates} onPatch={onPatch} onInsert={onInsert} onDelete={onDelete} onSelectAction={onSelectAction} />
              </BranchCol>
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
  if (node.type !== 'action') return null
  const selected = templates.find((t) => t.id === node.templateId) || null
  const typeBadge = selected
    ? (selected.template_type === 'carousel' ? '🎠 Carrousel'
      : selected.template_type === 'limited_time_offer' ? '🏷️ Offre limitée'
      : '💬 Message')
    : null
  return (
    <Shell tone={TONE.green} icon={<MessageSquare className="h-4 w-4" />} kind="Envoyer le modèle" onDelete={onDelete}>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun modèle approuvé.</p>
      ) : (
        <div className="space-y-2">
          <Select value={node.templateId || ''} onValueChange={(v) => { onPatch(node.id, { templateId: v } as never); onSelectAction(v) }}>
            <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
            <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}><span className="block max-w-[240px] truncate">{t.name}</span></SelectItem>)}</SelectContent>
          </Select>
          {/* Aperçu du message (bulle WhatsApp) directement dans le nœud. */}
          {selected && (
            <div>
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">{typeBadge}</div>
              <TemplateBubble
                template={selected}
                labels={(selected.variable_keys || []).map((k) => VARIABLE_BY_KEY[k]?.label || k)}
              />
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function ConditionBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  if (node.type !== 'condition') return null
  const field = CONDITION_FIELDS.find((f) => f.value === node.rule.field) || CONDITION_FIELDS[0]
  return (
    <Shell tone={TONE.violet} icon={<GitBranch className="h-4 w-4" />} kind="Si (condition)" onDelete={onDelete}>
      <div className="space-y-2">
        <Select value={node.rule.field} onValueChange={(v) => {
          const f = CONDITION_FIELDS.find((x) => x.value === v)!
          onPatch(node.id, { rule: { field: v as never, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' } } as never)
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={node.rule.op} onValueChange={(v) => onPatch(node.id, { rule: { ...node.rule, op: v as never } } as never)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{field.ops.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
          </Select>
          {field.valueType === 'boolean' ? (
            <Select value={String(node.rule.value)} onValueChange={(v) => onPatch(node.id, { rule: { ...node.rule, value: v === 'true' } } as never)}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent>
            </Select>
          ) : (
            <Input className="flex-1" type={field.valueType === 'number' ? 'number' : 'text'} placeholder={field.placeholder}
              value={String(node.rule.value ?? '')}
              onChange={(e) => onPatch(node.id, { rule: { ...node.rule, value: field.valueType === 'number' ? parseFloat(e.target.value) : e.target.value } } as never)} />
          )}
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

function Inserter({ onInsert }: { onInsert: (kind: 'delay' | 'condition' | 'action') => void }) {
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
            <MenuItem className="text-green-600" icon={<MessageSquare className="h-3.5 w-3.5" />} label="Message" onClick={() => { onInsert('action'); setOpen(false) }} />
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ className, icon, label, onClick }: { className?: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted', className)}>
      {icon}{label}
    </button>
  )
}