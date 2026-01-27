'use client'

import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type KPICardProps = {
  title: string
  value: number
  trend?: number | null
  icon: LucideIcon
  formatValue?: (value: number) => string
}

export function KPICard({ title, value, trend, icon: Icon, formatValue }: KPICardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formatValue ? formatValue(value) : value.toLocaleString('fr-FR')}
        </div>
        {trend != null && (
          <div
            className={`mt-1 flex items-center gap-1 text-xs ${
              trend > 0
                ? 'text-emerald-600'
                : trend < 0
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            <span>
              {trend > 0 ? '+' : ''}
              {trend}% vs période préc.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
