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
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/stats/kpi-card'
import dynamic from 'next/dynamic'

const MessagesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.MessagesChart })))
const TimeSeriesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TimeSeriesChart })))
const AgentsComparisonChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.AgentsComparisonChart })))
const StageDistributionChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.StageDistributionChart })))
const ResponseRateByStageChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.ResponseRateByStageChart })))
const TransitionsOverTimeChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TransitionsOverTimeChart })))
const DeviceBreakdownChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.DeviceBreakdownChart })))
const CountryBreakdownChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.CountryBreakdownChart })))
const UtmBreakdownChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.UtmBreakdownChart })))
const PeakHoursChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.PeakHoursChart })))
import { toast } from 'sonner'
import {
  MessageSquare,
  ArrowDownLeft,
  Users,
  UserPlus,
  Bot,
  Link2,
  MousePointerClick,
  ArrowRightLeft,
  Phone,
  Zap,
  Clock,
  Megaphone,
  Send,
  XCircle,
  TrendingUp,
  Activity,
  Filter,
  Sparkles,
  Coins,
  Smartphone,
  Globe,
  BarChart2,
  Mail,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, formatPhoneNumber } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'
import { BlobLoaderScreen } from '@/components/blob-loader'

type SessionOption = {
  id: string
  instance_name: string
  phone_number?: string | null
  display_name?: string | null
  channel: 'whatsapp' | 'email'
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function StatsPage() {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState('30')
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'email'>('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lifecycleFilter, setLifecycleFilter] = useState<string[]>([])

  const dateFnsLocale = locale === 'fr' ? fr : enUS
  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  // Filtrer les sessions affichées selon le canal sélectionné
  const filteredSessions = channelFilter === 'all'
    ? sessions
    : sessions.filter((s) => s.channel === channelFilter)

  // Charger la liste des sessions (WhatsApp + Email)
  useEffect(() => {
    async function loadSessions() {
      try {
        const [wRes, eRes] = await Promise.all([
          fetch('/api/sessions'),
          fetch('/api/email-sessions').catch(() => null),
        ])
        const wJson = wRes.ok ? await wRes.json() : { data: [] }
        const eJson = eRes?.ok ? await eRes.json() : { data: [] }

        const whatsappSessions: SessionOption[] = (wJson.data || []).map(
          (s: { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }) => ({
            id: s.id,
            instance_name: s.instance_name,
            phone_number: s.phone_number,
            display_name: s.display_name,
            channel: 'whatsapp' as const,
          })
        )
        const emailSessions: SessionOption[] = (eJson.data || []).map(
          (s: { id: string; email_address?: string | null; name?: string | null; display_name?: string | null }) => ({
            id: s.id,
            instance_name: s.email_address || s.name || s.display_name || 'Email',
            phone_number: s.email_address,
            display_name: s.display_name || s.name,
            channel: 'email' as const,
          })
        )
        setSessions([...whatsappSessions, ...emailSessions])
      } catch {
        // silently fail
      }
    }
    loadSessions()
  }, [])

  // Réinitialiser le filtre session quand on change de canal
  useEffect(() => {
    setSessionFilter('all')
  }, [channelFilter])

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
      <div data-tour="stats-header" data-page-header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('stats.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('stats.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtre période */}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('stats.7_days')}</SelectItem>
              <SelectItem value="30">{t('stats.30_days')}</SelectItem>
              <SelectItem value="90">{t('stats.90_days')}</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre canal */}
          <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as 'all' | 'whatsapp' | 'email')}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les canaux</SelectItem>
              <SelectItem value="whatsapp">
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </span>
              </SelectItem>
              <SelectItem value="email">
                <span className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-blue-500" />
                  Email
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre session */}
          <Select value={sessionFilter} onValueChange={setSessionFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder={t('stats.all_sessions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stats.all_sessions')}</SelectItem>
              {filteredSessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    {s.channel === 'email'
                      ? <Mail className="h-3 w-3 text-blue-500 shrink-0" />
                      : <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#25D366] shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    }
                    {getSessionDisplayName({ display_name: s.display_name || null, phone_number: s.phone_number || null, instance_name: s.instance_name })}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <BlobLoaderScreen />
      ) : stats ? (
        <Tabs defaultValue="overview">
          {/* Onglets scrollables horizontalement sur mobile (sinon ils debordent) */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-max gap-1">
              <TabsTrigger value="overview">{t('stats.overview')}</TabsTrigger>
              <TabsTrigger value="agents">{t('stats.agents_tab')}</TabsTrigger>
              <TabsTrigger value="links">{t('stats.links_tab')}</TabsTrigger>
              <TabsTrigger value="lifecycle">{t('stats.lifecycle_tab')}</TabsTrigger>
              <TabsTrigger value="campaigns">{t('stats.campaigns_tab')}</TabsTrigger>
              <TabsTrigger value="contacts">{t('stats.contacts_tab')}</TabsTrigger>
            </TabsList>
          </div>

          {/* ================================================================ */}
          {/* === Vue globale === */}
          {/* ================================================================ */}
          <TabsContent value="overview" className="space-y-8">
            {/* Section 1: Activité */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('stats.section_activity')}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard
                  title={t('stats.total_messages')}
                  value={stats.overview.totalMessages}
                  trend={stats.overview.messagesTrend}
                  icon={MessageSquare}
                />
                <KPICard
                  title={t('stats.messages_received')}
                  value={stats.overview.messagesIn}
                  trend={null}
                  icon={ArrowDownLeft}
                  color="blue"
                />
                <KPICard
                  title={t('stats.active_conversations')}
                  value={stats.overview.activeConversations}
                  trend={stats.overview.conversationsTrend}
                  icon={Users}
                  color="teal"
                />
                <KPICard
                  title={t('stats.new_contacts')}
                  value={stats.overview.newContacts}
                  trend={stats.overview.contactsTrend}
                  icon={UserPlus}
                  color="orange"
                />
              </div>
            </div>

            {/* Section 2: Performance */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('stats.section_performance')}
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
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
                  color="blue"
                />
                <KPICard
                  title={t('stats.avg_response_time')}
                  value={stats.overview.avgResponseTime ?? 0}
                  trend={null}
                  icon={Clock}
                  formatValue={(v) => v > 0 ? formatSeconds(v) : '—'}
                  color="teal"
                />
              </div>
            </div>

            {/* Section 3: Graphiques */}
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
                    color="var(--accent,#40E9BE)"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ================================================================ */}
          {/* === Agents IA === */}
          {/* ================================================================ */}
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

          {/* ================================================================ */}
          {/* === Liens WA === */}
          {/* ================================================================ */}
          <TabsContent value="links" className="space-y-6">
            {stats.links.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">{t('stats.no_links')}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs globaux */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard
                    title={t('stats.total_clicks')}
                    value={stats.links.reduce((sum, l) => sum + l.totalClicks, 0)}
                    trend={null}
                    icon={MousePointerClick}
                    color="blue"
                  />
                  <KPICard
                    title={t('stats.unique_visitors')}
                    value={stats.links.reduce((sum, l) => sum + l.uniqueVisitors, 0)}
                    trend={null}
                    icon={Users}
                    color="teal"
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
                    formatValue={(v) => `${v}%`}
                    color="orange"
                  />
                </div>

                {/* Tableau récapitulatif par lien */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Link2 className="h-4 w-4" />
                      Performance par lien
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                            <th className="px-4 py-3 font-medium">Lien</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.clicks')}</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.unique')}</th>
                            <th className="px-4 py-3 font-medium text-right">Conversations</th>
                            <th className="px-4 py-3 font-medium text-right">Taux conv.</th>
                            <th className="px-4 py-3 font-medium text-right">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.links
                            .sort((a, b) => b.totalClicks - a.totalClicks)
                            .map((link, i) => {
                              const convRate = link.totalClicks > 0
                                ? Math.round((link.conversionsCount / link.totalClicks) * 100)
                                : 0
                              return (
                                <tr key={link.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                                  <td className="px-4 py-3">
                                    <div className="font-medium">{link.name}</div>
                                    {link.slug && (
                                      <div className="text-xs text-muted-foreground">/{link.slug}</div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold">
                                    {link.totalClicks.toLocaleString(numberLocale)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">
                                    {link.uniqueVisitors.toLocaleString(numberLocale)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {link.conversionsCount.toLocaleString(numberLocale)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={cn(
                                      'font-semibold',
                                      convRate >= 20 ? 'text-primary' : convRate >= 10 ? 'text-orange-500' : 'text-muted-foreground'
                                    )}>
                                      {convRate}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Badge variant={link.isActive ? 'default' : 'secondary'} className="text-xs">
                                      {link.isActive ? t('common.active') : t('common.inactive')}
                                    </Badge>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/20 font-semibold">
                            <td className="px-4 py-3">Total</td>
                            <td className="px-4 py-3 text-right">
                              {stats.links.reduce((s, l) => s + l.totalClicks, 0).toLocaleString(numberLocale)}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {stats.links.reduce((s, l) => s + l.uniqueVisitors, 0).toLocaleString(numberLocale)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {stats.links.reduce((s, l) => s + l.conversionsCount, 0).toLocaleString(numberLocale)}
                            </td>
                            <td className="px-4 py-3 text-right text-primary">
                              {(() => {
                                const tc = stats.links.reduce((s, l) => s + l.totalClicks, 0)
                                const conv = stats.links.reduce((s, l) => s + l.conversionsCount, 0)
                                return tc > 0 ? `${Math.round((conv / tc) * 100)}%` : '—'
                              })()}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Entonnoir de conversion */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ArrowRightLeft className="h-4 w-4" />
                      {t('stats.conversion_funnel')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-center">
                        <p className="text-2xl font-bold text-blue-500">
                          {stats.links.reduce((s, l) => s + l.totalClicks, 0).toLocaleString(numberLocale)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{t('stats.clicks')}</p>
                      </div>
                      <div className="text-muted-foreground text-2xl">→</div>
                      <div className="flex-1 rounded-lg bg-sky-500/10 border border-sky-500/20 p-4 text-center">
                        <p className="text-2xl font-bold text-sky-500">
                          {stats.links.reduce((s, l) => s + l.uniqueVisitors, 0).toLocaleString(numberLocale)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{t('stats.unique_visitors')}</p>
                      </div>
                      <div className="text-muted-foreground text-2xl">→</div>
                      <div className="flex-1 rounded-lg bg-primary/10 border border-primary/20 p-4 text-center">
                        <p className="text-2xl font-bold text-primary">
                          {stats.links.reduce((s, l) => s + l.conversionsCount, 0).toLocaleString(numberLocale)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{t('stats.conversations')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Graphique clics par jour */}
                {(() => {
                  const allClicksPerDay = new Map<string, number>()
                  for (const link of stats.links) {
                    for (const pt of link.clicksPerDay) {
                      allClicksPerDay.set(pt.date, (allClicksPerDay.get(pt.date) || 0) + pt.count)
                    }
                  }
                  const chartData = Array.from(allClicksPerDay.entries())
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => a.date.localeCompare(b.date))

                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{t('stats.clicks_per_day')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {chartData.length > 0 ? (
                          <TimeSeriesChart data={chartData} title="" color="#3B82F6" />
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">{t('stats.no_click_data')}</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Répartition appareils + pays */}
                {(() => {
                  const deviceAgg = new Map<string, number>()
                  for (const link of stats.links) {
                    for (const d of link.deviceBreakdown) {
                      deviceAgg.set(d.type, (deviceAgg.get(d.type) || 0) + d.count)
                    }
                  }
                  const deviceData = Array.from(deviceAgg.entries())
                    .map(([type, count]) => ({ type, count }))
                    .sort((a, b) => b.count - a.count)

                  const countryAgg = new Map<string, number>()
                  for (const link of stats.links) {
                    for (const c of link.countryBreakdown) {
                      countryAgg.set(c.country, (countryAgg.get(c.country) || 0) + c.count)
                    }
                  }
                  const countryData = Array.from(countryAgg.entries())
                    .map(([country, count]) => ({ country, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10)

                  return (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Smartphone className="h-4 w-4" />
                            {t('stats.device_breakdown')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {deviceData.length > 0
                            ? <DeviceBreakdownChart data={deviceData} />
                            : <p className="text-sm text-muted-foreground py-4 text-center">{t('stats.no_click_data')}</p>
                          }
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Globe className="h-4 w-4" />
                            {t('stats.country_breakdown')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {countryData.length > 0
                            ? <CountryBreakdownChart data={countryData} />
                            : <p className="text-sm text-muted-foreground py-4 text-center">{t('stats.no_click_data')}</p>
                          }
                        </CardContent>
                      </Card>
                    </div>
                  )
                })()}

                {/* Sources UTM + Heures de pointe */}
                {(() => {
                  const utmAgg = new Map<string, number>()
                  for (const link of stats.links) {
                    for (const u of link.utmBreakdown) {
                      utmAgg.set(u.source, (utmAgg.get(u.source) || 0) + u.count)
                    }
                  }
                  const utmData = Array.from(utmAgg.entries())
                    .map(([source, count]) => ({ source, count }))
                    .sort((a, b) => b.count - a.count)

                  const hourAgg = new Map<number, number>()
                  for (let h = 0; h < 24; h++) hourAgg.set(h, 0)
                  for (const link of stats.links) {
                    for (const p of link.peakHours) {
                      hourAgg.set(p.hour, (hourAgg.get(p.hour) || 0) + p.count)
                    }
                  }
                  const peakData = Array.from(hourAgg.entries())
                    .map(([hour, count]) => ({ hour, count }))
                    .sort((a, b) => a.hour - b.hour)

                  return (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart2 className="h-4 w-4" />
                            {t('stats.utm_breakdown')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {utmData.length > 0
                            ? <UtmBreakdownChart data={utmData} />
                            : <p className="text-sm text-muted-foreground py-4 text-center">{t('stats.no_utm_data')}</p>
                          }
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Clock className="h-4 w-4" />
                            {t('stats.peak_hours')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-2">{t('stats.peak_hours_note')}</p>
                          <PeakHoursChart data={peakData} />
                        </CardContent>
                      </Card>
                    </div>
                  )
                })()}

                {/* Historique clics récents */}
                {(() => {
                  const allClicks = stats.links
                    .flatMap((link) =>
                      link.recentClicks.map((c) => ({
                        ...c,
                        linkName: link.name,
                        linkSlug: link.slug,
                      }))
                    )
                    .sort((a, b) => b.clicked_at.localeCompare(a.clicked_at))
                    .slice(0, 50)

                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{t('stats.click_history')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {allClicks.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                  <th className="px-4 py-3 font-medium">{t('stats.click_date')}</th>
                                  <th className="px-4 py-3 font-medium">{t('stats.click_link')}</th>
                                  <th className="px-4 py-3 font-medium">{t('stats.click_country')}</th>
                                  <th className="px-4 py-3 font-medium">{t('stats.click_device')}</th>
                                  <th className="px-4 py-3 font-medium">{t('stats.click_utm')}</th>
                                  <th className="px-4 py-3 font-medium">{t('stats.click_referer')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allClicks.map((click, i) => {
                                  const d = new Date(click.clicked_at)
                                  const dateStr = d.toLocaleDateString(numberLocale, {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })
                                  const timeStr = d.toLocaleTimeString(numberLocale, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                  return (
                                    <tr key={`${click.clicked_at}-${i}`} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-medium">{dateStr}</span>
                                        <span className="text-muted-foreground ml-2">{timeStr}</span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                          {click.linkName}
                                          {click.linkSlug && (
                                            <span className="text-xs text-muted-foreground">/{click.linkSlug}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {click.country ? `${click.country}${click.city ? ` · ${click.city}` : ''}` : '—'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {click.device_type ? (
                                          <span className="flex items-center gap-1">
                                            {click.device_type}
                                            {click.os && <span className="text-muted-foreground text-xs">({click.os})</span>}
                                          </span>
                                        ) : '—'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {click.utm_source ? `${click.utm_source}${click.utm_campaign ? ` / ${click.utm_campaign}` : ''}` : '—'}
                                      </td>
                                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                                        {click.referer || '—'}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">{t('stats.no_click_data')}</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })()}
              </>
            )}
          </TabsContent>

          {/* ================================================================ */}
          {/* === Lifecycle (Pro & Scale) === */}
          {/* ================================================================ */}
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
                    color="blue"
                  />
                  <KPICard
                    title={t('stats.lc_ai_analyses')}
                    value={stats.lifecycle.aiAnalysesCount}
                    trend={null}
                    icon={Sparkles}
                    color="teal"
                  />
                  <KPICard
                    title={t('stats.lc_tokens_used')}
                    value={stats.lifecycle.tokensUsed}
                    trend={null}
                    icon={Coins}
                    formatValue={(v) => v.toLocaleString(numberLocale)}
                    color="orange"
                  />
                </div>

                {/* Charts */}
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
                          <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                            <th className="px-4 py-3 font-medium">{t('stats.lc_stage')}</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.conversations')}</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.lc_inbound')}</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.response_rate')}</th>
                            <th className="px-4 py-3 font-medium text-right">{t('stats.avg_time')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lifecycleFilter.length > 0
                            ? stats.lifecycle.stages.filter((s) => lifecycleFilter.includes(s.id))
                            : stats.lifecycle.stages
                          ).map((stage, i) => (
                            <tr key={stage.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                              <td className="px-4 py-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-sm"
                                    style={{ backgroundColor: stage.color }}
                                  />
                                  {stage.name}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {stage.conversationCount.toLocaleString(numberLocale)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {stage.inboundMessages.toLocaleString(numberLocale)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-primary">
                                {stage.responseRate != null ? `${stage.responseRate}%` : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
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

          {/* ================================================================ */}
          {/* === Campagnes (Scale) === */}
          {/* ================================================================ */}
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
                    color="teal"
                  />
                  <KPICard
                    title={t('stats.messages_sent')}
                    value={stats.campaigns.totalSent}
                    trend={null}
                    icon={Send}
                    color="blue"
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
                    color="orange"
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
                      completed: 'bg-sky-100 text-sky-700',
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
                            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                              <th className="px-4 py-3 font-medium">{t('stats.agent')}</th>
                              <th className="px-4 py-3 font-medium text-right">{t('stats.campaigns_tab')}</th>
                              <th className="px-4 py-3 font-medium text-right">{t('stats.sent')}</th>
                              <th className="px-4 py-3 font-medium text-right">{t('stats.responses')}</th>
                              <th className="px-4 py-3 font-medium text-right">{t('stats.rate')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.campaigns.relanceAgentStats.map((agent, i) => (
                              <tr key={agent.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                                <td className="px-4 py-3 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                    {agent.name}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {agent.campaignsCount}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {agent.totalSent.toLocaleString(numberLocale)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {agent.totalReplied.toLocaleString(numberLocale)}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-primary">
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

          {/* ================================================================ */}
          {/* === Contacts === */}
          {/* ================================================================ */}
          <TabsContent value="contacts" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
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
                color="teal"
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
                        <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="px-4 py-3 font-medium">{t('stats.contact')}</th>
                          <th className="px-4 py-3 font-medium">{t('stats.phone')}</th>
                          <th className="px-4 py-3 font-medium text-right">{t('stats.messages')}</th>
                          <th className="px-4 py-3 font-medium text-right">{t('stats.last_message')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.contacts.topContacts.map((contact, i) => (
                          <tr key={contact.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                            <td className="px-4 py-3 font-medium">
                              {contact.name || t('common.unknown')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" />
                                {formatPhoneNumber(contact.phoneNumber)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {contact.messageCount.toLocaleString(numberLocale)}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
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
        </Tabs>
      ) : null}
    </div>
  )
}
