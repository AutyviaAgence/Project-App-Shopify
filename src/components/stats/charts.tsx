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
  Cell,
} from 'recharts'
import type { StatsMessagePoint, StatsTimePoint, StatsLifecycleStage } from '@/types/stats'

// Autyvia brand colors
const COLORS = {
  green: '#7DC2A5',
  turquoise: '#40E9BE',
  turquoiseDark: '#33B89A',
  grayDark: '#2D3E48',
  grayMuted: '#9CAAB5',
  purple: '#8B5CF6',
  blue: '#3B82F6',
  gridLine: '#3D4E58',
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

// Custom tooltip component for better visibility
function CustomTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  labelFormatter?: (label: string) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[140px]">
      <p className="text-sm font-medium text-foreground mb-2">
        {labelFormatter ? labelFormatter(label as string) : label}
      </p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
          <span className="font-semibold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// --- Messages Bar Chart (stacked inbound / outbound) ---

type MessagesChartProps = {
  data: StatsMessagePoint[]
}

export function MessagesChart({ data }: MessagesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <YAxis
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ fill: 'rgba(125, 194, 165, 0.1)' }}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        <Bar
          dataKey="outbound"
          name="Envoyés"
          stackId="messages"
          fill={COLORS.green}
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="inbound"
          name="Reçus"
          stackId="messages"
          fill={COLORS.turquoise}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
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
  color = COLORS.turquoise,
}: TimeSeriesChartProps) {
  // Generate unique gradient ID based on title or random
  const gradientId = `gradient-${title.replace(/\s+/g, '-') || 'default'}`

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <YAxis
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          name="Nombre"
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// --- Agents Comparison Horizontal Bar Chart ---

type AgentsComparisonChartProps = {
  data: { name: string; messagesHandled: number; conversationsManaged: number }[]
}

export function AgentsComparisonChart({ data }: AgentsComparisonChartProps) {
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 60)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          type="number"
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'rgba(125, 194, 165, 0.1)' }}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        <Bar
          dataKey="conversationsManaged"
          name="Conversations"
          fill={COLORS.green}
          radius={[0, 4, 4, 0]}
        />
        <Bar
          dataKey="messagesHandled"
          name="Messages traités"
          fill={COLORS.turquoise}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Contacts Over Time Area Chart ---

export function ContactsOverTimeChart({ data }: { data: StatsTimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <YAxis
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: COLORS.purple, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <defs>
          <linearGradient id="gradient-contacts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.4} />
            <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          name="Nouveaux contacts"
          stroke={COLORS.purple}
          fill="url(#gradient-contacts)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// --- Stage Distribution Horizontal Bar Chart ---

type StageDistributionChartProps = {
  data: { name: string; count: number; color: string }[]
}

export function StageDistributionChart({ data }: StageDistributionChartProps) {
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          type="number"
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'rgba(125, 194, 165, 0.1)' }}
        />
        <Bar dataKey="count" name="Conversations" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Response Rate by Stage Bar Chart ---

type ResponseRateByStageChartProps = {
  data: { name: string; responseRate: number; color: string }[]
}

export function ResponseRateByStageChart({ data }: ResponseRateByStageChartProps) {
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'rgba(125, 194, 165, 0.1)' }}
        />
        <Bar dataKey="responseRate" name="Taux de réponse" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Transitions Over Time Stacked Area Chart ---

type TransitionsOverTimeChartProps = {
  data: Record<string, number | string>[]
  stages: { id: string; name: string; color: string }[]
}

export function TransitionsOverTimeChart({ data, stages }: TransitionsOverTimeChartProps) {
  if (data.length === 0 || stages.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridLine} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
        />
        <YAxis
          tick={{ fill: COLORS.grayMuted, fontSize: 12 }}
          axisLine={{ stroke: COLORS.gridLine }}
          tickLine={{ stroke: COLORS.gridLine }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: COLORS.grayMuted, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        <defs>
          {stages.map((stage) => (
            <linearGradient key={stage.id} id={`gradient-lc-${stage.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={stage.color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={stage.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        {stages.map((stage) => (
          <Area
            key={stage.id}
            type="monotone"
            dataKey={stage.id}
            name={stage.name}
            stackId="lifecycle"
            stroke={stage.color}
            fill={`url(#gradient-lc-${stage.id})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
