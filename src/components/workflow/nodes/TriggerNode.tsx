'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Zap } from 'lucide-react'
import type { TriggerNodeData } from '@/lib/workflow/types'

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData
  return (
    <div className={`min-w-[190px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-emerald-500 shadow-emerald-500/20 shadow-lg' : 'border-border'}`}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
          <Zap className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-semibold">{d.label}</p>
          {d.description && <p className="text-[10px] text-muted-foreground">{d.description}</p>}
        </div>
      </div>
      <div className="mt-2 h-px bg-emerald-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}
