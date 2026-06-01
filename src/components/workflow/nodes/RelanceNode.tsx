'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock } from 'lucide-react'
import type { RelanceNodeData } from '@/lib/workflow/types'

export function RelanceNode({ data, selected }: NodeProps) {
  const d = data as unknown as RelanceNodeData
  const delayLabel = d.delayHours >= 24 ? `${Math.round(d.delayHours / 24)}j` : `${d.delayHours}h`
  return (
    <div className={`min-w-[190px] max-w-[230px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-amber-500 shadow-amber-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
          <Clock className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{d.label}</p>
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Après {delayLabel}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">×{d.maxRelances} max</span>
          </div>
          {d.message && <p className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{d.message}</p>}
        </div>
      </div>
      <div className="mt-2 h-px bg-amber-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}
