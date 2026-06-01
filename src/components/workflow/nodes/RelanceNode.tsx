'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { RelanceNodeData } from '@/lib/workflow/types'

export function RelanceNode({ data, selected }: NodeProps) {
  const d = data as unknown as RelanceNodeData
  const delayLabel = d.delayHours >= 24 ? `${Math.round(d.delayHours / 24)}j` : `${d.delayHours}h`
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-amber-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-amber-500 shadow-amber-500/20 shadow-lg' : 'border-amber-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">⏰</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{d.label}</p>
          <div className="mt-1 flex gap-1">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">Après {delayLabel} sans réponse</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">×{d.maxRelances} max</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}
