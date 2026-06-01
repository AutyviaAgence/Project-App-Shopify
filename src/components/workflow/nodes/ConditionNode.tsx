'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { ConditionNodeData } from '@/lib/workflow/types'

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData
  return (
    <div className={`min-w-[190px] max-w-[230px] rounded-xl border-2 bg-card p-3 shadow-sm transition-shadow ${selected ? 'border-yellow-500 shadow-yellow-500/20 shadow-lg' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15">
          <GitBranch className="h-4 w-4 text-yellow-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{d.label}</p>
          {d.value && <p className="mt-0.5 text-[10px] text-muted-foreground truncate">Si : {d.value}</p>}
        </div>
      </div>
      <div className="mt-2 h-px bg-yellow-500/20" />
      <div className="mt-2 flex justify-between px-3">
        <span className="text-[9px] font-medium text-emerald-600">Oui</span>
        <span className="text-[9px] font-medium text-rose-500">Non</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '28%' }} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '72%' }} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  )
}
