'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TriggerNodeData } from '@/lib/workflow/types'

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData
  return (
    <div className={`min-w-[180px] rounded-xl border-2 bg-emerald-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-emerald-500 shadow-emerald-500/20 shadow-lg' : 'border-emerald-500/50'}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">🟢</span>
        <div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{d.label}</p>
          {d.description && <p className="text-[10px] text-muted-foreground">{d.description}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}
