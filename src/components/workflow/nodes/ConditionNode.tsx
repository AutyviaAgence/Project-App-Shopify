'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ConditionNodeData } from '@/lib/workflow/types'

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData
  return (
    <div className={`min-w-[180px] max-w-[220px] rounded-xl border-2 bg-yellow-500/10 p-3 shadow-sm transition-shadow ${selected ? 'border-yellow-500 shadow-yellow-500/20 shadow-lg' : 'border-yellow-500/50'}`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">❓</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">{d.label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground truncate">Si : {d.value}</p>
        </div>
      </div>
      {/* Deux sorties : Oui (droite) et Non (gauche) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '30%' }}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '70%' }}
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />
      <div className="mt-2 flex justify-between px-2">
        <span className="text-[9px] text-emerald-600">✓ Oui</span>
        <span className="text-[9px] text-rose-600">✗ Non</span>
      </div>
    </div>
  )
}
