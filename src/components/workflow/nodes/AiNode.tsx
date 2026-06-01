'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AiNodeData } from '@/lib/workflow/types'

export function AiNode({ data, selected }: NodeProps) {
  const d = data as unknown as AiNodeData
  return (
    <div className={`min-w-[200px] max-w-[240px] rounded-xl border-2 bg-violet-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-violet-500 shadow-violet-500/20 shadow-lg' : 'border-violet-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">🤖</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{d.label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{d.shortPrompt}</p>
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {d.useKnowledge && (
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] text-violet-700 dark:text-violet-300">📚 Base de conn.</span>
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{d.model}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}
