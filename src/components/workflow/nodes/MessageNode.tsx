'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MessageNodeData } from '@/lib/workflow/types'

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-blue-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-blue-500 shadow-blue-500/20 shadow-lg' : 'border-blue-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">💬</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{d.label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}
