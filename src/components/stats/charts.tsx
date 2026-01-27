'use client'

import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatsMessagePoint, StatsTimePoint } from '@/types/stats'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

// --- Messages Bar Chart (stacked inbound / outbound) ---

type MessagesChartProps = {
  data: StatsMessagePoint[]
}

export function MessagesChart({ data }: MessagesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Messages par jour</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              labelFormatter={(label) => formatDate(label as string)}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar
              dataKey="inbound"
              name="Reçus"
              stackId="messages"
              fill="hsl(var(--chart-1))"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="outbound"
              name="Envoyés"
              stackId="messages"
              fill="hsl(var(--chart-2))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// --- Generic Time Series Area Chart ---

type TimeSeriesChartProps = {
  data: StatsTimePoint[]
  title: string
  color?: string
}

export function TimeSeriesChart({
  data,
  title,
  color = 'hsl(var(--chart-3))',
}: TimeSeriesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(label) => formatDate(label as string)}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <defs>
              <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="count"
              name="Nombre"
              stroke={color}
              fill={`url(#gradient-${title})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// --- Agents Comparison Horizontal Bar Chart ---

type AgentsComparisonChartProps = {
  data: { name: string; messagesHandled: number; conversationsManaged: number }[]
}

export function AgentsComparisonChart({ data }: AgentsComparisonChartProps) {
  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparaison des agents</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 60)}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              className="text-xs"
              width={120}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar
              dataKey="messagesHandled"
              name="Messages traités"
              fill="hsl(var(--chart-1))"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="conversationsManaged"
              name="Conversations"
              fill="hsl(var(--chart-4))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
