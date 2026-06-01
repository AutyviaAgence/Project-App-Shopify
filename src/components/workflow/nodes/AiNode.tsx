'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot, BookOpen } from 'lucide-react'
import type { AiNodeData } from '@/lib/workflow/types'

export function AiNode({ data, selected }: NodeProps) {
  const d = data as unknown as AiNodeData
  return (
    <div className={`min-w-[200px] max-w-[240px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-violet-500 shadow-violet-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
          <Bot className="h-4 w-4 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{d.label}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{d.shortPrompt || 'Cliquez pour configurer'}</p>
          {d.useKnowledge && (
            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-violet-600">
              <BookOpen className="h-2.5 w-2.5" /> Base de connaissances
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 h-px bg-violet-500/20" />
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}
