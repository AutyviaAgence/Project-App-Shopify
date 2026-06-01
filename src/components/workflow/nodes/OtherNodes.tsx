'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EscaladeNodeData, BookingNodeData, TagNodeData, MediaNodeData, StopNodeData } from '@/lib/workflow/types'

export function EscaladeNode({ data, selected }: NodeProps) {
  const d = data as unknown as EscaladeNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-rose-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-rose-500 shadow-rose-500/20 shadow-lg' : 'border-rose-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">👤</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{d.label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>
        </div>
      </div>
    </div>
  )
}

export function BookingNode({ data, selected }: NodeProps) {
  const d = data as unknown as BookingNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-cyan-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-cyan-500 shadow-cyan-500/20 shadow-lg' : 'border-cyan-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">📅</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{d.label}</p>
          {d.message && <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export function MediaNode({ data, selected }: NodeProps) {
  const d = data as unknown as MediaNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-orange-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-orange-500 shadow-orange-500/20 shadow-lg' : 'border-orange-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">🖼️</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">{d.label}</p>
          {d.imageRef && <span className="mt-1 block rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] text-orange-700 dark:text-orange-300 w-fit">[IMAGE:{d.imageRef}]</span>}
          {d.message && <p className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{d.message}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export function TagNode({ data, selected }: NodeProps) {
  const d = data as unknown as TagNodeData
  return (
    <div className={`min-w-[160px] rounded-xl border-2 bg-pink-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-pink-500 shadow-pink-500/20 shadow-lg' : 'border-pink-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-pink-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2">
        <span className="text-lg">🏷️</span>
        <div>
          <p className="text-xs font-semibold text-pink-700 dark:text-pink-300">{d.label}</p>
          <p className="text-[10px] text-muted-foreground">{d.action === 'add' ? '+ ' : '− '}{d.tagName}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-pink-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export function StopNode({ data, selected }: NodeProps) {
  const d = data as unknown as StopNodeData
  return (
    <div className={`min-w-[140px] rounded-xl border-2 bg-slate-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-slate-500 shadow-slate-500/20 shadow-lg' : 'border-slate-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2">
        <span className="text-lg">🛑</span>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{d.label}</p>
      </div>
    </div>
  )
}
