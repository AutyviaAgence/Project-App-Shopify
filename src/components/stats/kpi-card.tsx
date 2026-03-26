'use client'

import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type KPICardProps = {
  title: string
  value: number
  trend?: number | null
  icon: LucideIcon
  formatValue?: (value: number) => string
  color?: 'green' | 'blue' | 'teal' | 'orange'
}

const colorClasses = {
  green: {
    bg: 'bg-primary/10',
    icon: 'text-primary',
    border: 'border-primary/20',
  },
  blue: {
    bg: 'bg-blue-500/10',
    icon: 'text-blue-500',
    border: 'border-blue-500/20',
  },
  teal: {
    bg: 'bg-sky-500/10',
    icon: 'text-sky-500',
    border: 'border-sky-500/20',
  },
  orange: {
    bg: 'bg-orange-500/10',
    icon: 'text-orange-500',
    border: 'border-orange-500/20',
  },
}

export function KPICard({
  title,
  value,
  trend,
  icon: Icon,
  formatValue,
  color = 'green',
}: KPICardProps) {
  const colors = colorClasses[color]

  return (
    <div className={cn(
      'rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5',
      colors.border
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {title}
          </p>
          <p className="text-3xl font-bold tracking-tight">
            {formatValue ? formatValue(value) : value.toLocaleString('fr-FR')}
          </p>
          {trend != null && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                trend > 0
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : trend < 0
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span>
                {trend > 0 ? '+' : ''}
                {trend}%
              </span>
            </div>
          )}
        </div>
        <div className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
          colors.bg
        )}>
          <Icon className={cn('h-6 w-6', colors.icon)} />
        </div>
      </div>
    </div>
  )
}
