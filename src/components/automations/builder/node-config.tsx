'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'
import { CONDITION_FIELDS } from './field-labels'

const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' }, { v: 30, l: '30 min' }, { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' }, { v: 1440, l: '1 jour' }, { v: 2880, l: '2 jours' }, { v: 10080, l: '7 jours' },
]

/** Panneau d'édition du nœud sélectionné. Met à jour le graphe via onPatch. */
export function NodeConfig({
  graph, nodeId, templates, onPatch,
}: {
  graph: WorkflowGraph
  nodeId: string
  templates: WhatsAppTemplate[]
  onPatch: (nodeId: string, patch: Partial<WorkflowNode>) => void
}) {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) return null

  if (node.type === 'trigger') {
    return (
      <Section title="Déclencheur" color="#3B82F6">
        <Label className="text-xs">Événement Shopify</Label>
        <Select value={node.event} onValueChange={(v) => onPatch(nodeId, { event: v as never })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TRIGGER_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{TRIGGER_EVENTS.find((e) => e.value === node.event)?.description}</p>
      </Section>
    )
  }

  if (node.type === 'delay') {
    return (
      <Section title="Attendre" color="#F59E0B">
        <Label className="text-xs">Délai avant l’étape suivante</Label>
        <Select value={String(node.minutes)} onValueChange={(v) => onPatch(nodeId, { minutes: parseInt(v, 10) } as never)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{DELAY_PRESETS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
        </Select>
      </Section>
    )
  }

  if (node.type === 'condition') {
    const field = CONDITION_FIELDS.find((f) => f.value === node.rule.field) || CONDITION_FIELDS[0]
    return (
      <Section title="Condition" color="#8B5CF6">
        <Label className="text-xs">Critère</Label>
        <Select value={node.rule.field} onValueChange={(v) => {
          const f = CONDITION_FIELDS.find((x) => x.value === v)!
          onPatch(nodeId, { rule: { field: v as never, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' } } as never)
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>

        <Label className="mt-3 text-xs">Opérateur</Label>
        <Select value={node.rule.op} onValueChange={(v) => onPatch(nodeId, { rule: { ...node.rule, op: v as never } } as never)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{field.ops.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
        </Select>

        <Label className="mt-3 text-xs">Valeur</Label>
        {field.valueType === 'boolean' ? (
          <Select value={String(node.rule.value)} onValueChange={(v) => onPatch(nodeId, { rule: { ...node.rule, value: v === 'true' } } as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent>
          </Select>
        ) : (
          <Input
            type={field.valueType === 'number' ? 'number' : 'text'}
            value={String(node.rule.value ?? '')}
            placeholder={field.placeholder}
            onChange={(e) => onPatch(nodeId, { rule: { ...node.rule, value: field.valueType === 'number' ? parseFloat(e.target.value) : e.target.value } } as never)}
          />
        )}
        <p className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
          ✓ <b className="text-green-600">Oui</b> = condition remplie · ✗ <b className="text-red-500">Non</b> = sinon. Reliez chaque branche à une suite.
        </p>
      </Section>
    )
  }

  // action
  return (
    <Section title="Envoyer un message" color="#22C55E">
      <Label className="text-xs">Modèle WhatsApp</Label>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun modèle approuvé.</p>
      ) : (
        <Select value={node.templateId || ''} onValueChange={(v) => {
          const tpl = templates.find((t) => t.id === v)
          onPatch(nodeId, { templateId: v, label: tpl?.name } as never)
        }}>
          <SelectTrigger><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
          <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </Section>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-sm font-semibold" style={{ color }}>{title}</p>
      {children}
    </div>
  )
}
