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
import { useTenant, adjustColor } from '@/lib/tenant/context'
import type { StatsMessagePoint, StatsTimePoint, StatsLifecycleStage, StatsDevicePoint, StatsCountryPoint, StatsUtmPoint, StatsPeakHourPoint } from '@/types/stats'

/** Derive chart colors from tenant branding */
function useChartColors() {
  const tenant = useTenant()
  const muted = tenant.textColor ? adjustColor(tenant.textColor, -30) : '#9CAAB5'
  const grid = tenant.bgColor ? adjustColor(tenant.bgColor, 18) : '#3D4E58'
  return {
    primary: tenant.primaryColor,
    accent: tenant.accentColor,
    accentDark: adjustColor(tenant.accentColor, -15),
    muted,
    sky: '#0EA5E9',
    blue: '#3B82F6',
    grid,
    cursorFill: `${tenant.primaryColor}18`,
  }
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
  height?: number | `${number}%`
}

export function MessagesChart({ data, height = 280 }: MessagesChartProps) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ fill: c.cursorFill }}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        <Bar
          dataKey="outbound"
          name="Envoyés"
          stackId="messages"
          fill={c.primary}
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="inbound"
          name="Reçus"
          stackId="messages"
          fill={c.accent}
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
  height?: number | `${number}%`
}

export function TimeSeriesChart({
  data,
  title,
  color,
  height = 280,
}: TimeSeriesChartProps) {
  const c = useChartColors()
  const chartColor = color || c.accent
  const gradientId = `gradient-${title.replace(/\s+/g, '-') || 'default'}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: chartColor, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
            <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          name="Nombre"
          stroke={chartColor}
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
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 60)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          type="number"
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: c.cursorFill }}
        />
        <Legend
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        <Bar
          dataKey="conversationsManaged"
          name="Conversations"
          fill={c.primary}
          radius={[0, 4, 4, 0]}
        />
        <Bar
          dataKey="messagesHandled"
          name="Messages traités"
          fill={c.accent}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Contacts Over Time Area Chart ---

export function ContactsOverTimeChart({ data }: { data: StatsTimePoint[] }) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: c.sky, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <defs>
          <linearGradient id="gradient-contacts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.sky} stopOpacity={0.4} />
            <stop offset="95%" stopColor={c.sky} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          name="Nouveaux contacts"
          stroke={c.sky}
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
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          type="number"
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: c.cursorFill }}
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
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: c.cursorFill }}
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
  const c = useChartColors()
  if (data.length === 0 || stages.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 12 }}
          axisLine={{ stroke: c.grid }}
          tickLine={{ stroke: c.grid }}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip labelFormatter={formatDate} />}
          cursor={{ stroke: c.muted, strokeWidth: 1, strokeDasharray: '3 3' }}
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

// --- Device Breakdown Horizontal Bar Chart ---

export function DeviceBreakdownChart({ data }: { data: StatsDevicePoint[] }) {
  const c = useChartColors()
  const deviceColors: Record<string, string> = {
    mobile: c.accent,
    desktop: c.blue,
    tablet: c.sky,
    unknown: c.muted,
  }

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis type="number" tick={{ fill: c.muted, fontSize: 12 }} allowDecimals={false} />
        <YAxis type="category" dataKey="type" width={80} tick={{ fill: c.muted, fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursorFill }} />
        <Bar dataKey="count" name="Clics" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={deviceColors[entry.type] ?? c.muted} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Country Breakdown Horizontal Bar Chart ---

export function CountryBreakdownChart({ data }: { data: StatsCountryPoint[] }) {
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis type="number" tick={{ fill: c.muted, fontSize: 12 }} allowDecimals={false} />
        <YAxis type="category" dataKey="country" width={50} tick={{ fill: c.muted, fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursorFill }} />
        <Bar dataKey="count" name="Clics" fill={c.primary} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- UTM Source Breakdown Horizontal Bar Chart ---

export function UtmBreakdownChart({ data }: { data: StatsUtmPoint[] }) {
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 45)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis type="number" tick={{ fill: c.muted, fontSize: 12 }} allowDecimals={false} />
        <YAxis type="category" dataKey="source" width={80} tick={{ fill: c.muted, fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursorFill }} />
        <Bar dataKey="count" name="Clics" fill={c.sky} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Peak Hours Bar Chart (24 bars, 0h-23h) ---

export function PeakHoursChart({ data }: { data: StatsPeakHourPoint[] }) {
  const c = useChartColors()
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} opacity={0.3} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => `${h}h`}
          tick={{ fill: c.muted, fontSize: 11 }}
        />
        <YAxis tick={{ fill: c.muted, fontSize: 12 }} allowDecimals={false} />
        <Tooltip
          content={<CustomTooltip labelFormatter={(h) => `${h}h00`} />}
          cursor={{ fill: c.cursorFill }}
        />
        <Bar dataKey="count" name="Clics" fill={c.accent} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
