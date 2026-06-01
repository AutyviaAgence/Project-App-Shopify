'use client'

import * as LucideIcons from 'lucide-react'
import { NODE_TYPE_CONFIGS, type WorkflowNodeType } from '@/lib/workflow/types'
import { cn } from '@/lib/utils'

interface WorkflowPaletteProps {
  onInsertNode?: (type: WorkflowNodeType) => void
}

export function WorkflowPalette({ onInsertNode }: WorkflowPaletteProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-52 border-r bg-card flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-3 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Blocs</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Cliquez ou glissez sur le canvas</p>
      </div>
      <div className="flex-1 p-2 space-y-1">
        {NODE_TYPE_CONFIGS.map((config) => {
          // Récupérer l'icône Lucide dynamiquement
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const IconComponent = (LucideIcons as any)[config.iconName] as React.ComponentType<{ className?: string }>

          return (
            <div
              key={config.type}
              draggable
              onDragStart={(e) => onDragStart(e, config.type)}
              onClick={() => onInsertNode?.(config.type)}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                'cursor-pointer select-none transition-all',
                'hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]',
                'bg-card',
                config.borderColor.replace('border-', 'border-l-4 border-l-')
              )}
            >
              {/* Icône dans un carré coloré */}
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.color)}>
                {IconComponent && <IconComponent className={cn('h-4 w-4', config.iconColor)} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{config.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{config.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
