'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { UserCheck, CalendarCheck, Image, Tag, OctagonX } from 'lucide-react'
import type { EscaladeNodeData, BookingNodeData, TagNodeData, MediaNodeData, StopNodeData } from '@/lib/workflow/types'

export function EscaladeNode({ data, selected }: NodeProps) {
  const d = data as unknown as EscaladeNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-rose-500 shadow-rose-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15">
          <UserCheck className="h-4 w-4 text-rose-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{d.label}</p>
          {d.message && <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>}
        </div>
      </div>
      <div className="mt-2 h-px bg-rose-500/20" />
    </div>
  )
}

export function BookingNode({ data, selected }: NodeProps) {
  const d = data as unknown as BookingNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-cyan-500 shadow-cyan-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
          <CalendarCheck className="h-4 w-4 text-cyan-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{d.label}</p>
          {d.message && <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>}
        </div>
      </div>
      <div className="mt-2 h-px bg-cyan-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}

export function MediaNode({ data, selected }: NodeProps) {
  const d = data as unknown as MediaNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-orange-500 shadow-orange-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
          <Image className="h-4 w-4 text-orange-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{d.label}</p>
          {d.imageRef && (
            <span className="mt-1 inline-block rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-mono font-medium text-orange-700">
              [IMAGE:{d.imageRef}]
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 h-px bg-orange-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}

export function TagNode({ data, selected }: NodeProps) {
  const d = data as unknown as TagNodeData
  return (
    <div className={`min-w-[160px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-pink-500 shadow-pink-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-pink-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-500/15">
          <Tag className="h-4 w-4 text-pink-600" />
        </div>
        <div>
          <p className="text-xs font-semibold">{d.label}</p>
          <p className="text-[10px] text-muted-foreground">{d.action === 'add' ? '+ ' : '− '}{d.tagName || '...'}</p>
        </div>
      </div>
      <div className="mt-2 h-px bg-pink-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-pink-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}

export function StopNode({ data, selected }: NodeProps) {
  const d = data as unknown as StopNodeData
  return (
    <div className={`min-w-[150px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-slate-500 shadow-slate-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/15">
          <OctagonX className="h-4 w-4 text-slate-500" />
        </div>
        <p className="text-xs font-semibold">{d.label}</p>
      </div>
    </div>
  )
}
