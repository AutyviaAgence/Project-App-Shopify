'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StatsResponse } from '@/types/stats'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/stats/kpi-card'
import {
  MessagesChart,
  TimeSeriesChart,
  AgentsComparisonChart,
  StageDistributionChart,
  ResponseRateByStageChart,
  TransitionsOverTimeChart,
} from '@/components/stats/charts'
import { toast } from 'sonner'
import {
  MessageSquare,
  ArrowDownLeft,
  Users,
  UserPlus,
  Loader2,
  Bot,
  Link2,
  MousePointerClick,
  ArrowRightLeft,
  Phone,
  Zap,
  Clock,
  Megaphone,
  Send,
  CheckCircle,
  XCircle,
  TrendingUp,
  Activity,
  Filter,
  Sparkles,
  Coins,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, formatPhoneNumber } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'

type SessionOption = { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function StatsPage() {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState('30')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lifecycleFilter, setLifecycleFilter] = useState<string[]>([])

  const dateFnsLocale = locale === 'fr' ? fr : enUS
  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  // Charger la liste des sessions une seule fois
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions')
        const json = await res.json()
        if (res.ok && json.data) {
          setSessions(
            json.data.map((s: { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }) => ({
              id: s.id,
              instance_name: s.instance_name,
              phone_number: s.phone_number,
              display_name: s.display_name,
            }))
          )
        }
      } catch {
        // silently fail
      }
    }
    loadSessions()
  }, [])

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (sessionFilter !== 'all') params.set('session_id', sessionFilter)
      const res = await fetch(`/api/stats?${params}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setStats(json.data)
      } else {
        toast.error(json.error || t('stats.load_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setLoading(false)
    }
  }, [period, sessionFilter, t])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div data-tour="stats-header" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('stats.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('stats.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('stats.7_days')}</SelectItem>
              <SelectItem value="30">{t('stats.30_days')}</SelectItem>
              <SelectItem value="90">{t('stats.90_days')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sessionFilter} onValueChange={setSessionFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={t('stats.all_sessions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stats.all_sessions')}</SelectItem>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {getSessionDisplayName({ display_name: s.display_name || null, phone_number: s.phone_number || null, instance_name: s.instance_name })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t('stats.overview')}</TabsTrigger>
            <TabsTrigger value="campaigns">{t('stats.campaigns_tab')}</TabsTrigger>
            <TabsTrigger value="agents">{t('stats.agents_tab')}</TabsTrigger>
            <TabsTrigger value="links">{t('stats.links_tab')}</TabsTrigger>
            <TabsTrigger value="contacts">{t('stats.contacts_tab')}</TabsTrigger>
            <TabsTrigger value="lifecycle">{t('stats.lifecycle_tab')}</TabsTrigger>
          </TabsList>

          {/* === Vue globale === */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard
                title={t('stats.total_messages')}
                value={stats.overview.totalMessages}
                trend={stats.overview.messagesTrend}
                icon={MessageSquare}
              />
              <KPICard
                title={t('stats.active_conversations')}
                value={stats.overview.activeConversations}
                trend={stats.overview.conversationsTrend}
                icon={Users}
              />
              <KPICard
                title={t('stats.new_contacts')}
                value={stats.overview.newContacts}
                trend={stats.overview.contactsTrend}
                icon={UserPlus}
              />
              <KPICard
                title={t('stats.messages_received')}
                value={stats.overview.messagesIn}
                trend={null}
                icon={ArrowDownLeft}
              />
              <KPICard
                title={t('stats.contact_response_rate')}
                value={stats.overview.contactResponseRate ?? 0}
                trend={null}
                icon={TrendingUp}
                formatValue={(v) => `${v}%`}
              />
              <KPICard
                title={t('stats.ai_response_rate')}
                value={stats.overview.responseRate ?? 0}
                trend={null}
                icon={Zap}
                formatValue={(v) => `${v}%`}
              />
              <KPICard
                title={t('stats.avg_response_time')}
                value={stats.overview.avgResponseTime ?? 0}
                trend={null}
                icon={Clock}
                formatValue={(v) => v > 0 ? formatSeconds(v) : '—'}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('stats.messages_per_day')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <MessagesChart data={stats.charts.messagesOverTime} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('stats.new_conversations')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={stats.charts.conversationsOverTime}
                    title=""
                    color="#40E9BE"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* === Campagnes === */}
          <TabsContent value="campaigns" className="space-y-6">
            {!stats.campaigns || stats.campaigns.totalCampaigns === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">{t('stats.no_campaigns')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs Campagnes */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard
                    title={t('stats.total_campaigns')}
                    value={stats.campaigns.totalCampaigns}
                    trend={null}
                    icon={Megaphone}
                  />
                  <KPICard
                    title={t('stats.messages_sent')}
                    value={stats.campaigns.totalSent}
                    trend={null}
                    icon={Send}
                  />
                  <KPICard
                    title={t('stats.responses_received')}
                    value={stats.campaigns.totalReplied}
                    trend={null}
                    icon={MessageSquare}
                  />
                  <KPICard
                    title={t('stats.response_rate')}
                    value={stats.campaigns.overallResponseRate}
                    trend={null}
                    icon={TrendingUp}
                    formatValue={(v) => `${v}%`}
                  />
                </div>

                {/* Stats par campagne */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.campaigns.campaigns.map((campaign) => {
                    const statusColors: Record<string, string> = {
                      draft: 'bg-gray-100 text-gray-700',
                      scheduled: 'bg-blue-100 text-blue-700',
                      running: 'bg-green-100 text-green-700',
                      paused: 'bg-yellow-100 text-yellow-700',
                      completed: 'bg-purple-100 text-purple-700',
                      cancelled: 'bg-red-100 text-red-700',
                    }
                    const statusLabels: Record<string, string> = {
                      draft: t('stats.status_draft'),
                      scheduled: t('stats.status_scheduled'),
                      running: t('stats.status_running'),
                      paused: t('stats.status_paused'),
                      completed: t('stats.status_completed'),
                      cancelled: t('stats.status_cancelled'),
                    }
                    return (
                      <Card key={campaign.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Megaphone className="h-4 w-4" />
                              {campaign.name}
                            </CardTitle>
                            <Badge className={statusColors[campaign.status] || 'bg-gray-100'}>
                              {statusLabels[campaign.status] || campaign.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.sentCount.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('stats.sent')}
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.repliedCount.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('stats.responses')}
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-primary">
                                {campaign.responseRate}%
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('stats.response_rate')}
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.totalRecipients.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('stats.recipients')}
                              </p>
                            </div>
                          </div>
                          {campaign.relanceAgentName && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Bot className="h-3 w-3" />
                                {t('stats.agent')} : {campaign.relanceAgentName}
                              </div>
                            </div>
                          )}
                          {campaign.failedCount > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="h-3 w-3" />
                              {t('stats.failures', { count: String(campaign.failedCount) })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Stats par agent de relance */}
                {stats.campaigns.relanceAgentStats.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('stats.relance_performance')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 pr-4">{t('stats.agent')}</th>
                              <th className="pb-2 pr-4 text-right">{t('stats.campaigns_tab')}</th>
                              <th className="pb-2 pr-4 text-right">{t('stats.sent')}</th>
                              <th className="pb-2 pr-4 text-right">{t('stats.responses')}</th>
                              <th className="pb-2 text-right">{t('stats.rate')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.campaigns.relanceAgentStats.map((agent) => (
                              <tr key={agent.id} className="border-b last:border-0">
                                <td className="py-2 pr-4 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                    {agent.name}
                                  </div>
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.campaignsCount}
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.totalSent.toLocaleString(numberLocale)}
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.totalReplied.toLocaleString(numberLocale)}
                                </td>
                                <td className="py-2 text-right font-medium text-primary">
                                  {agent.responseRate}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* === Agents IA === */}
          <TabsContent value="agents" className="space-y-6">
            {stats.agents.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">{t('stats.no_agents')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.agents.map((agent) => (
                    <Card key={agent.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Bot className="h-4 w-4" />
                            {agent.name}
                          </CardTitle>
                          <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                            {agent.isActive ? t('common.active') : t('common.inactive')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.messagesHandled.toLocaleString(numberLocale)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('stats.messages_processed')}
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.conversationsManaged.toLocaleString(numberLocale)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('stats.conversations')}
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.responseRate != null ? `${agent.responseRate}%` : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('stats.response_rate')}
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.avgResponseTime != null ? formatSeconds(agent.avgResponseTime) : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('stats.avg_time')}
                            </p>
                          </div>
                          {agent.hasBookingUrl && (
                            <div className="col-span-2 border-t pt-3 mt-2">
                              <p className="text-2xl font-bold text-primary">
                                {agent.bookingClicks.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('stats.booking_clicks')}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('stats.agent_comparison')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AgentsComparisonChart data={stats.agents} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* === Liens WA === */}
          <TabsContent value="links" className="space-y-6">
            {stats.links.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">{t('stats.no_links')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard
                    title={t('stats.total_clicks')}
                    value={stats.links.reduce((sum, l) => sum + l.totalClicks, 0)}
                    trend={null}
                    icon={MousePointerClick}
                  />
                  <KPICard
                    title={t('stats.total_conversions')}
                    value={stats.links.reduce((sum, l) => sum + l.conversionsCount, 0)}
                    trend={null}
                    icon={ArrowRightLeft}
                  />
                  <KPICard
                    title={t('stats.avg_conversion_rate')}
                    value={(() => {
                      const totalClicks = stats.links.reduce((s, l) => s + l.totalClicks, 0)
                      const totalConv = stats.links.reduce((s, l) => s + l.conversionsCount, 0)
                      return totalClicks > 0 ? Math.round((totalConv / totalClicks) * 100) : 0
                    })()}
                    trend={null}
                    icon={Link2}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.links.map((link) => {
                    const convRate = link.totalClicks > 0
                      ? Math.round((link.conversionsCount / link.totalClicks) * 100)
                      : 0
                    return (
                      <Card key={link.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Link2 className="h-4 w-4" />
                              {link.name}
                            </CardTitle>
                            <Badge variant={link.isActive ? 'default' : 'secondary'}>
                              {link.isActive ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </div>
                          {link.slug && (
                            <p className="text-xs text-muted-foreground">
                              /{link.slug}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xl font-bold">
                                {link.totalClicks.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">{t('stats.clicks')}</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold">
                                {link.conversionsCount.toLocaleString(numberLocale)}
                              </p>
                              <p className="text-xs text-muted-foreground">{t('stats.conv')}</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold">{convRate}%</p>
                              <p className="text-xs text-muted-foreground">{t('stats.rate')}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* === Contacts === */}
          <TabsContent value="contacts" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard
                title={t('stats.total_contacts')}
                value={stats.overview.totalContacts}
                trend={null}
                icon={Users}
              />
              <KPICard
                title={t('stats.new_contacts')}
                value={stats.overview.newContacts}
                trend={stats.overview.contactsTrend}
                icon={UserPlus}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('stats.contacts_per_day')}</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={stats.charts.newContactsOverTime}
                  title=""
                  color="#8B5CF6"
                />
              </CardContent>
            </Card>

            {/* Top 10 contacts */}
            {stats.contacts.topContacts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('stats.top_10_contacts')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">{t('stats.contact')}</th>
                          <th className="pb-2 pr-4">{t('stats.phone')}</th>
                          <th className="pb-2 pr-4 text-right">{t('stats.messages')}</th>
                          <th className="pb-2 text-right">{t('stats.last_message')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.contacts.topContacts.map((contact) => (
                          <tr key={contact.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">
                              {contact.name || t('common.unknown')}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {formatPhoneNumber(contact.phoneNumber)}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right font-medium">
                              {contact.messageCount.toLocaleString(numberLocale)}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {contact.lastMessageAt
                                ? formatDistanceToNow(
                                    new Date(contact.lastMessageAt),
                                    { addSuffix: true, locale: dateFnsLocale }
                                  )
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contacts par session */}
            {stats.contacts.contactsBySession.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('stats.contacts_per_session')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.contacts.contactsBySession.map((s) => (
                      <div key={s.sessionId} className="flex items-center justify-between">
                        <span className="text-sm">{s.sessionName}</span>
                        <Badge variant="secondary">
                          {s.contactCount.toLocaleString(numberLocale)} {t('stats.contacts_label')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* === Lifecycle === */}
          <TabsContent value="lifecycle" className="space-y-6">
            {!stats.lifecycle || stats.lifecycle.stages.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">{t('stats.no_lifecycle')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Filtre par stade */}
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <button
                    onClick={() => setLifecycleFilter([])}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      lifecycleFilter.length === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {t('stats.all_stages')}
                  </button>
                  {stats.lifecycle.stages.map((stage) => {
                    const isSelected = lifecycleFilter.includes(stage.id)
                    return (
                      <button
                        key={stage.id}
                        onClick={() => {
                          setLifecycleFilter((prev) =>
                            isSelected
                              ? prev.filter((id) => id !== stage.id)
                              : [...prev, stage.id]
                          )
                        }}
                        className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: isSelected ? stage.color : undefined,
                          color: isSelected ? '#fff' : stage.color,
                          border: `1.5px solid ${stage.color}`,
                        }}
                      >
                        {stage.name}
                      </button>
                    )
                  })}
                </div>

                {/* KPI Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard
                    title={t('stats.lc_total_conversations')}
                    value={stats.lifecycle.totalConversations}
                    trend={null}
                    icon={Users}
                  />
                  <KPICard
                    title={t('stats.lc_classified')}
                    value={stats.lifecycle.classifiedPercent}
                    trend={null}
                    icon={Activity}
                    formatValue={(v) => `${v}%`}
                  />
                  <KPICard
                    title={t('stats.lc_ai_analyses')}
                    value={stats.lifecycle.aiAnalysesCount}
                    trend={null}
                    icon={Sparkles}
                  />
                  <KPICard
                    title={t('stats.lc_tokens_used')}
                    value={stats.lifecycle.tokensUsed}
                    trend={null}
                    icon={Coins}
                    formatValue={(v) => v.toLocaleString(numberLocale)}
                  />
                </div>

                {/* Charts côte à côte */}
                {(() => {
                  const filteredStages = lifecycleFilter.length > 0
                    ? stats.lifecycle!.stages.filter((s) => lifecycleFilter.includes(s.id))
                    : stats.lifecycle!.stages

                  const distributionData = filteredStages.map((s) => ({
                    name: s.name,
                    count: s.conversationCount,
                    color: s.color,
                  }))

                  const responseRateData = filteredStages
                    .filter((s) => s.responseRate != null)
                    .map((s) => ({
                      name: s.name,
                      responseRate: s.responseRate!,
                      color: s.color,
                    }))

                  const transitionStages = filteredStages.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                  }))

                  return (
                    <>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">{t('stats.lc_distribution')}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <StageDistributionChart data={distributionData} />
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">{t('stats.lc_response_rate')}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponseRateByStageChart data={responseRateData} />
                          </CardContent>
                        </Card>
                      </div>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{t('stats.lc_transitions')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <TransitionsOverTimeChart
                            data={stats.lifecycle!.transitionsOverTime}
                            stages={transitionStages}
                          />
                        </CardContent>
                      </Card>
                    </>
                  )
                })()}

                {/* Table détaillée */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('stats.lc_details')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">{t('stats.lc_stage')}</th>
                            <th className="pb-2 pr-4 text-right">{t('stats.conversations')}</th>
                            <th className="pb-2 pr-4 text-right">{t('stats.lc_inbound')}</th>
                            <th className="pb-2 pr-4 text-right">{t('stats.response_rate')}</th>
                            <th className="pb-2 text-right">{t('stats.avg_time')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lifecycleFilter.length > 0
                            ? stats.lifecycle.stages.filter((s) => lifecycleFilter.includes(s.id))
                            : stats.lifecycle.stages
                          ).map((stage) => (
                            <tr key={stage.id} className="border-b last:border-0">
                              <td className="py-2 pr-4 font-medium">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-sm"
                                    style={{ backgroundColor: stage.color }}
                                  />
                                  {stage.name}
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-right">
                                {stage.conversationCount.toLocaleString(numberLocale)}
                              </td>
                              <td className="py-2 pr-4 text-right">
                                {stage.inboundMessages.toLocaleString(numberLocale)}
                              </td>
                              <td className="py-2 pr-4 text-right font-medium text-primary">
                                {stage.responseRate != null ? `${stage.responseRate}%` : '—'}
                              </td>
                              <td className="py-2 text-right text-muted-foreground">
                                {stage.avgResponseTime != null ? formatSeconds(stage.avgResponseTime) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
