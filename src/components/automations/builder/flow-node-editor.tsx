'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TRIGGER_EVENTS, triggersForKind } from '@/lib/automations/types'
import { CONDITION_FIELDS } from './field-labels'
import type { WorkflowNode, ConditionRule } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'
import { quickReplyLabels } from './flow-nodes'

const DELAY_PRESETS = [
  { label: 'Immédiat', minutes: 0 }, { label: '1 h', minutes: 60 },
  { label: '24 h', minutes: 1440 }, { label: '48 h', minutes: 2880 },
  { label: '7 jours', minutes: 10080 },
]

/** Panneau d'édition du nœud sélectionné dans le canvas. */
export function NodeEditorPanel({
  node, templates, onPatch,
}: {
  node: WorkflowNode
  templates: WhatsAppTemplate[]
  onPatch: (id: string, patch: Partial<WorkflowNode>) => void
}) {
  if (node.type === 'trigger') {
    // Campagnes : uniquement les déclencheurs marketing.
    const allowed = triggersForKind('marketing')
    return (
      <div className="space-y-2">
        <Label>Déclencheur</Label>
        <Select value={node.event} onValueChange={(v) => onPatch(node.id, { event: v as never })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowed.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {TRIGGER_EVENTS.find((e) => e.value === node.event)?.description}
        </p>
      </div>
    )
  }

  if (node.type === 'delay') {
    return (
      <div className="space-y-2">
        <Label>Délai d’attente</Label>
        <div className="flex flex-wrap gap-1.5">
          {DELAY_PRESETS.map((d) => (
            <button key={d.minutes} onClick={() => onPatch(node.id, { minutes: d.minutes })}
              className={`rounded-lg border px-2.5 py-1 text-xs ${node.minutes === d.minutes ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (node.type === 'condition') {
    const rule = node.rule
    const set = (r: Partial<ConditionRule>) => onPatch(node.id, { rule: { ...rule, ...r } })
    const field = CONDITION_FIELDS.find((f) => f.value === rule.field)
    return (
      <div className="space-y-2">
        <Label>Condition (branche Oui / Non)</Label>
        <select value={rule.field}
          onChange={(e) => { const f = CONDITION_FIELDS.find((x) => x.value === e.target.value)!; set({ field: f.value, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' }) }}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={rule.op} onChange={(e) => set({ op: e.target.value as ConditionRule['op'] })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {(field?.ops || []).map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input value={String(rule.value ?? '')} onChange={(e) => set({ value: e.target.value })}
            placeholder="valeur" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
        </div>
      </div>
    )
  }

  if (node.type === 'ab_test') {
    return (
      <div className="space-y-2">
        <Label>Test A/B</Label>
        {(node.variants || []).map((v, i) => (
          <div key={v.key} className="flex items-center gap-2 text-sm">
            <span className="w-16">Variante {v.key}</span>
            <input type="number" min={1} max={100} value={v.weight}
              onChange={(e) => onPatch(node.id, { variants: node.variants.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) || 0 } : x) })}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Reliez chaque variante à sa suite sur le canvas.</p>
      </div>
    )
  }

  // action / message
  const tpl = templates.find((t) => t.id === node.templateId)
  const btns = quickReplyLabels(tpl)
  return (
    <div className="space-y-2">
      <Label>Message à envoyer</Label>
      <Select value={node.templateId || ''} onValueChange={(v) => onPatch(node.id, { templateId: v })}>
        <SelectTrigger><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} <span className="text-muted-foreground">({t.language})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {btns.length > 0 ? (
        <div className="rounded-lg border border-[#25d366]/25 bg-[#25d366]/5 p-2 text-[11px] text-white/70">
          Ce modèle a {btns.length} bouton{btns.length > 1 ? 's' : ''} : reliez chacun à sa suite sur le canvas
          pour créer le funnel.
        </div>
      ) : tpl ? (
        <p className="text-[11px] text-muted-foreground">Ce modèle n’a pas de bouton : une seule suite possible.</p>
      ) : null}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium">{children}</label>
}
