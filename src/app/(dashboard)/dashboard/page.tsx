'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/i18n/context'
import type { StatsResponse } from '@/types/stats'
import type { WhatsAppSession } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/stats/kpi-card'
import dynamic from 'next/dynamic'

const MessagesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.MessagesChart })))
const TimeSeriesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TimeSeriesChart })))
import { toast } from 'sonner'
import {
  MessageSquare,
  Users,
  UserPlus,
  Zap,
  Loader2,
  Smartphone,
  Bot,
  Link2,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { StartTourButton } from '@/components/guided-tour'
import Link from 'next/link'
import { cn } from '@/lib/utils'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function DashboardPage() {
  const { t, locale } = useTranslation()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch('/api/stats?period=7'),
        fetch('/api/sessions'),
      ])
      const statsJson = await statsRes.json()
      const sessionsJson = await sessionsRes.json()

      if (statsRes.ok && statsJson.data) {
        setStats(statsJson.data)
      }
      if (sessionsRes.ok && sessionsJson.data) {
        setSessions(sessionsJson.data)
      }
    } catch {
      toast.error(t('dashboard.load_error'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const connectedSessions = sessions.filter((s) => s.status === 'connected').length
  const activeAgents = stats?.agents.filter((a) => a.isActive).length ?? 0
  const totalAgents = stats?.agents.length ?? 0
  const activeLinks = stats?.links.filter((l) => l.isActive).length ?? 0
  const totalLinks = stats?.links.length ?? 0

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div data-tour="header" className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t('dashboard.greeting')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.overview')}
          </p>
        </div>
        <StartTourButton />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div data-tour="kpi-cards" className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <KPICard
              title={t('dashboard.messages')}
              value={stats.overview.totalMessages}
              trend={stats.overview.messagesTrend}
              icon={MessageSquare}
              color="green"
            />
            <KPICard
              title={t('dashboard.conversations')}
              value={stats.overview.activeConversations}
              trend={stats.overview.conversationsTrend}
              icon={Users}
              color="blue"
            />
            <KPICard
              title={t('dashboard.new_contacts')}
              value={stats.overview.newContacts}
              trend={stats.overview.contactsTrend}
              icon={UserPlus}
              color="teal"
            />
            <KPICard
              title={t('dashboard.ai_rate')}
              value={stats.overview.responseRate ?? 0}
              trend={null}
              icon={Zap}
              formatValue={(v) => `${v}%`}
              color="orange"
            />
          </div>

          {/* Quick Stats Row */}
          <div data-tour="quick-stats" className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <QuickStatCard
              href="/sessions"
              icon={Smartphone}
              label={t('dashboard.whatsapp_sessions')}
              value={`${connectedSessions}/${sessions.length}`}
              status={connectedSessions > 0 ? 'success' : 'inactive'}
              statusLabel={connectedSessions > 0 ? t('dashboard.connected') : t('dashboard.none_female')}
            />
            <QuickStatCard
              href="/agents"
              icon={Bot}
              label={t('dashboard.ai_agents')}
              value={`${activeAgents}/${totalAgents}`}
              status={activeAgents > 0 ? 'success' : 'inactive'}
              statusLabel={activeAgents > 0 ? t('common.active') : t('dashboard.none_male')}
              subtitle={
                stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0
                  ? t('dashboard.avg_time', { time: formatSeconds(stats.overview.avgResponseTime) })
                  : undefined
              }
            />
            <QuickStatCard
              href="/links"
              icon={Link2}
              label={t('dashboard.whatsapp_links')}
              value={`${activeLinks}/${totalLinks}`}
              status={activeLinks > 0 ? 'success' : 'inactive'}
              statusLabel={activeLinks > 0 ? t('common.active') : t('dashboard.none_male')}
              subtitle={
                totalLinks > 0
                  ? `${stats.links.reduce((s, l) => s + l.totalClicks, 0).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} ${t('dashboard.clicks')}`
                  : undefined
              }
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 md:p-6">
              <h3 className="text-sm font-semibold mb-4">{t('dashboard.messages_per_day')}</h3>
              <MessagesChart data={stats.charts.messagesOverTime} />
            </div>
            <div className="rounded-xl border bg-card p-4 md:p-6">
              <h3 className="text-sm font-semibold mb-4">{t('dashboard.new_conversations')}</h3>
              <TimeSeriesChart
                data={stats.charts.conversationsOverTime}
                title=""
                color="var(--accent, #40E9BE)"
              />
            </div>
          </div>

          {/* Activity Summary */}
          {stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0 && (
            <div className="rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t('dashboard.ai_performance')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.avg_response_time', { time: formatSeconds(stats.overview.avgResponseTime) })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

// Quick stat card component
function QuickStatCard({
  href,
  icon: Icon,
  label,
  value,
  status,
  statusLabel,
  subtitle,
}: {
  href: string
  icon: React.ElementType
  label: string
  value: string
  status: 'success' | 'inactive'
  statusLabel: string
  subtitle?: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          status === 'success' ? 'bg-primary/10' : 'bg-muted'
        )}>
          <Icon className={cn(
            'h-5 w-5',
            status === 'success' ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{value}</span>
            <Badge
              variant={status === 'success' ? 'default' : 'secondary'}
              className={cn(
                'text-[10px] px-1.5',
                status === 'success' && 'bg-primary hover:bg-primary/80'
              )}
            >
              {statusLabel}
            </Badge>
          </div>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
