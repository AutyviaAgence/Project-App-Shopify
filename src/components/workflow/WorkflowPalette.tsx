'use client'

import { NODE_TYPE_CONFIGS } from '@/lib/workflow/types'

export function WorkflowPalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-56 border-r bg-muted/30 flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blocs disponibles</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Glissez un bloc sur le canvas</p>
      </div>
      <div className="flex-1 p-2 space-y-1">
        {NODE_TYPE_CONFIGS.map((config) => (
          <div
            key={config.type}
            draggable
            onDragStart={(e) => onDragStart(e, config.type)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm hover:scale-[1.02] select-none ${config.color} ${config.borderColor.replace('border-', 'border-')}`}
          >
            <span className="text-base">{config.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{config.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">{config.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
