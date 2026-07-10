'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap, Clock, GitBranch, MessageSquare, FlaskConical, Reply } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsAppTemplate, TemplateButton } from '@/types/database'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS } from './field-labels'
import { buttonBranch, variantBranch, type WorkflowNode } from '@/lib/automations/graph-types'

/**
 * Nœuds custom du canvas horizontal React Flow (campagnes marketing).
 *
 * Chaque nœud porte :
 *  - un handle CIBLE (target) à gauche — sauf le trigger,
 *  - un ou plusieurs handles SOURCE (source) à droite. L'`id` du handle = la
 *    BRANCHE de l'arête (`yes`/`no`, `variant:X`, `button:<libellé>`), c'est ce
 *    qui permet à onConnect de recréer la bonne WorkflowEdge.
 *
 * Les données passées à React Flow (node.data) : { node: WorkflowNode,
 * templates, onPatch, onOpen }. On garde le modèle métier intact ; le canvas ne
 * fait que le rendre et remonter les positions/edges.
 */

export type FlowNodeData = {
  node: WorkflowNode
  templates: WhatsAppTemplate[]
  selected?: boolean
}

const HANDLE = '!h-3 !w-3 !border-2 !border-background'

/** Récupère les libellés des boutons quick-reply d'un template. */
export function quickReplyLabels(t: WhatsAppTemplate | undefined): string[] {
  if (!t) return []
  return ((t.buttons ?? []) as TemplateButton[])
    .filter((b) => b.type === 'QUICK_REPLY')
    .map((b) => b.text)
}

function Shell({
  children, tone, icon: Icon, title, hasTarget = true,
}: {
  children?: React.ReactNode
  tone: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  hasTarget?: boolean
}) {
  return (
    <div className={cn('relative w-64 rounded-2xl border bg-[#0e1626] shadow-lg', tone)}>
      {hasTarget && <Handle type="target" position={Position.Left} className={cn(HANDLE, '!bg-white/60')} />}
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="px-3 py-2.5 text-[13px] text-white/80">{children}</div>
    </div>
  )
}

export function TriggerFlowNode({ data }: NodeProps) {
  const { node } = data as unknown as FlowNodeData
  if (node.type !== 'trigger') return null
  const label = TRIGGER_EVENTS.find((e) => e.value === node.event)?.label ?? 'Déclencheur'
  return (
    <div className="relative w-64 rounded-2xl border border-sky-400/40 bg-[#0e1626] shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-sky-300">
        <Zap className="h-4 w-4" />
        <span className="text-sm font-semibold">Quand</span>
      </div>
      <div className="px-3 py-2.5 text-[13px] text-white/85">{label}</div>
      <Handle type="source" position={Position.Right} className={cn(HANDLE, '!bg-sky-400')} />
    </div>
  )
}

export function DelayFlowNode({ data }: NodeProps) {
  const { node } = data as unknown as FlowNodeData
  if (node.type !== 'delay') return null
  const m = node.minutes || 0
  const human = m >= 1440 ? `${Math.round(m / 1440)} j` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`
  return (
    <Shell tone="border-amber-400/40" icon={Clock} title="Attendre">
      <p className="text-amber-300">{m === 0 ? 'Immédiat' : human}</p>
      <Handle type="source" position={Position.Right} className={cn(HANDLE, '!bg-amber-400')} />
    </Shell>
  )
}

export function ConditionFlowNode({ data }: NodeProps) {
  const { node } = data as unknown as FlowNodeData
  if (node.type !== 'condition') return null
  const f = CONDITION_FIELDS.find((x) => x.value === node.rule.field)
  return (
    <div className="relative w-64 rounded-2xl border border-violet-400/40 bg-[#0e1626] shadow-lg">
      <Handle type="target" position={Position.Left} className={cn(HANDLE, '!bg-white/60')} />
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-violet-300">
        <GitBranch className="h-4 w-4" />
        <span className="text-sm font-semibold">Condition</span>
      </div>
      <div className="px-3 py-2.5 text-[13px] text-white/85">
        {f?.label} {node.rule.op} {String(node.rule.value)}
      </div>
      {/* Deux sorties : Oui (haut) / Non (bas). */}
      <div className="flex flex-col gap-1 border-t border-white/10 px-3 py-1.5 text-[11px]">
        <div className="relative flex items-center justify-end gap-1 text-emerald-400">
          Oui
          <Handle id="yes" type="source" position={Position.Right} style={{ top: 'auto', bottom: 26 }} className={cn(HANDLE, '!bg-emerald-400 !relative !transform-none')} />
        </div>
        <div className="relative flex items-center justify-end gap-1 text-red-400">
          Non
          <Handle id="no" type="source" position={Position.Right} style={{ top: 'auto', bottom: 6 }} className={cn(HANDLE, '!bg-red-400 !relative !transform-none')} />
        </div>
      </div>
    </div>
  )
}

export function ABTestFlowNode({ data }: NodeProps) {
  const { node } = data as unknown as FlowNodeData
  if (node.type !== 'ab_test') return null
  return (
    <div className="relative w-64 rounded-2xl border border-fuchsia-400/40 bg-[#0e1626] shadow-lg">
      <Handle type="target" position={Position.Left} className={cn(HANDLE, '!bg-white/60')} />
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-fuchsia-300">
        <FlaskConical className="h-4 w-4" />
        <span className="text-sm font-semibold">Test A/B</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        {(node.variants || []).map((v) => (
          <div key={v.key} className="relative flex items-center justify-between text-[12px] text-white/80">
            <span>Variante {v.key} · {v.weight}%</span>
            <Handle id={variantBranch(v.key)} type="source" position={Position.Right} className={cn(HANDLE, '!bg-fuchsia-400 !relative !transform-none')} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActionFlowNode({ data }: NodeProps) {
  const { node, templates } = data as unknown as FlowNodeData
  if (node.type !== 'action') return null
  const tpl = templates.find((t) => t.id === node.templateId)
  const labels = quickReplyLabels(tpl)
  const hasButtons = labels.length > 0
  return (
    <div className="relative w-72 rounded-2xl border border-emerald-400/40 bg-[#0e1626] shadow-lg">
      <Handle type="target" position={Position.Left} className={cn(HANDLE, '!bg-white/60')} />
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#075E54]/40 px-3 py-2 text-emerald-200">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-semibold">Message</span>
      </div>
      <div className="px-3 py-2.5">
        {tpl ? (
          <div className="rounded-lg rounded-tl-none bg-[#202c33] px-2.5 py-2 text-[12px] leading-snug text-[#e9edef] shadow-sm">
            {(tpl.body_text || '').slice(0, 140)}{(tpl.body_text || '').length > 140 ? '…' : ''}
          </div>
        ) : (
          <p className="text-[12px] italic text-white/40">Aucun modèle sélectionné</p>
        )}
      </div>
      {/* Une sortie PAR BOUTON quick-reply → chaque bouton branche le funnel.
          Sans bouton : une sortie unique (message simple). */}
      {hasButtons ? (
        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          {labels.map((text) => (
            <div key={text} className="relative flex items-center justify-between gap-2 rounded-md bg-[#25d366]/10 px-2 py-1 text-[11px] font-medium text-[#25d366]">
              <span className="flex items-center gap-1 truncate"><Reply className="h-3 w-3" /> {text}</span>
              <Handle id={buttonBranch(text)} type="source" position={Position.Right} className={cn(HANDLE, '!bg-[#25d366] !relative !transform-none')} />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} className={cn(HANDLE, '!bg-emerald-400')} />
      )}
    </div>
  )
}

/** Table nodeType → composant, passée à <ReactFlow nodeTypes={...} />. */
export const flowNodeTypes = {
  trigger: TriggerFlowNode,
  delay: DelayFlowNode,
  condition: ConditionFlowNode,
  ab_test: ABTestFlowNode,
  action: ActionFlowNode,
}
