'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessageSquare } from 'lucide-react'
import type { MessageNodeData } from '@/lib/workflow/types'

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-blue-500 shadow-blue-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
          <MessageSquare className="h-4 w-4 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{d.label}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{d.message}</p>
        </div>
      </div>
      <div className="mt-2 h-px bg-blue-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}
