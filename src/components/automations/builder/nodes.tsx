'use client'

import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock, GitBranch, MessageSquare, ShoppingBag, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS } from './field-labels'

/**
 * Nœuds personnalisés React Flow pour le Visual Builder.
 * Chaque nœud a des "handles" (points de connexion) en haut (entrée) et bas
 * (sortie). Le nœud condition a 2 sorties : oui (gauche) / non (droite).
 */

const EVENT_LABEL: Record<string, string> = Object.fromEntries(TRIGGER_EVENTS.map((e) => [e.value, e.label]))

type BaseData = { onDelete?: (id: string) => void; selected?: boolean }

function Shell({
  id, color, icon, kind, title, subtitle, onDelete, deletable = true, children,
}: {
  id: string; color: string; icon: React.ReactNode; kind: string
  title: string; subtitle?: string; onDelete?: (id: string) => void; deletable?: boolean; children?: React.ReactNode
}) {
  return (
    <div className="group relative w-[210px] rounded-2xl border bg-card shadow-md" style={{ borderColor: `${color}55` }}>
      <div className="flex items-center gap-2 rounded-t-2xl px-3 py-2" style={{ background: `${color}14` }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>{kind}</span>
        {deletable && onDelete && (
          <button onClick={() => onDelete(id)} className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

const dot = '!h-2.5 !w-2.5 !border-2 !bg-background'

export function TriggerNode({ id, data }: NodeProps) {
  const d = data as BaseData & { event?: string }
  return (
    <>
      <Shell id={id} color="#3B82F6" kind="Quand" deletable={false}
        icon={<ShoppingBag className="h-4 w-4" />}
        title={EVENT_LABEL[d.event || ''] || 'Choisir un événement'} />
      <Handle type="source" position={Position.Bottom} className={cn(dot, '!border-[#3B82F6]')} />
    </>
  )
}

export function DelayNode({ id, data }: NodeProps) {
  const d = data as BaseData & { minutes?: number }
  const label = (m: number) => m === 0 ? 'Immédiat' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`
  return (
    <>
      <Handle type="target" position={Position.Top} className={cn(dot, '!border-[#F59E0B]')} />
      <Shell id={id} color="#F59E0B" kind="Attendre" onDelete={d.onDelete}
        icon={<Clock className="h-4 w-4" />}
        title={label(d.minutes ?? 0)} />
      <Handle type="source" position={Position.Bottom} className={cn(dot, '!border-[#F59E0B]')} />
    </>
  )
}

export function ConditionNode({ id, data }: NodeProps) {
  const d = data as BaseData & { rule?: { field: string; op: string; value: unknown } }
  const fieldLabel = CONDITION_FIELDS.find((f) => f.value === d.rule?.field)?.label || 'Condition'
  const summary = d.rule ? `${fieldLabel} ${d.rule.op} ${d.rule.value}` : 'À configurer'
  return (
    <>
      <Handle type="target" position={Position.Top} className={cn(dot, '!border-[#8B5CF6]')} />
      <Shell id={id} color="#8B5CF6" kind="Condition" onDelete={d.onDelete}
        icon={<GitBranch className="h-4 w-4" />}
        title={summary}>
        <div className="mt-2 flex justify-between text-[10px] font-semibold">
          <span className="text-green-600">● Oui</span>
          <span className="text-red-500">Non ●</span>
        </div>
      </Shell>
      {/* 2 sorties : oui (gauche) / non (droite) */}
      <Handle id="yes" type="source" position={Position.Bottom} style={{ left: '25%' }} className={cn(dot, '!border-green-500')} />
      <Handle id="no" type="source" position={Position.Bottom} style={{ left: '75%' }} className={cn(dot, '!border-red-500')} />
    </>
  )
}

export function ActionNode({ id, data }: NodeProps) {
  const d = data as BaseData & { templateName?: string }
  return (
    <>
      <Handle type="target" position={Position.Top} className={cn(dot, '!border-[#22C55E]')} />
      <Shell id={id} color="#22C55E" kind="Envoyer" onDelete={d.onDelete}
        icon={<MessageSquare className="h-4 w-4" />}
        title={d.templateName || 'Choisir un modèle'} subtitle="Message WhatsApp" />
    </>
  )
}

export const nodeTypes = {
  trigger: TriggerNode,
  delay: DelayNode,
  condition: ConditionNode,
  action: ActionNode,
}
