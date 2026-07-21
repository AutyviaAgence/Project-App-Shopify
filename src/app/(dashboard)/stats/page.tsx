'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSessionState } from '@/hooks/use-session-state'
import { useKeepAliveFocus } from '@/components/keep-alive-outlet'
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
import { EngagementFunnel } from '@/components/stats/engagement-funnel'
import { StatsOverviewBoard } from '@/components/stats/overview-board'
import { AutomationsBoard } from '@/components/stats/automations-board'
import { OptinsTab } from '@/components/stats/optins-tab'
import dynamic from 'next/dynamic'

const TimeSeriesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TimeSeriesChart })))
const AgentsComparisonChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.AgentsComparisonChart })))
const StageDistributionChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.StageDistributionChart })))
const ResponseRateByStageChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.ResponseRateByStageChart })))
const TransitionsOverTimeChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TransitionsOverTimeChart })))
import { toast } from 'sonner'
import {
  Users,
  UserPlus,
  Bot,
  Phone,
  Activity,
  Filter,
  Sparkles,
  Coins,
  ShoppingBag,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { getSessionDisplayName, formatPhoneNumber } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { NumberTicker } from '@/components/ui/number-ticker'

type SessionOption = {
  id: string
  instance_name: string
  phone_number?: string | null
  display_name?: string | null
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function StatsPage() {
  const { t, locale } = useTranslation()
  // Persistés pour la session : la période et les filtres choisis sont retrouvés
  // en revenant sur les stats.
  const [period, setPeriod] = useSessionState<string>('stats.period', '30')
  const [sessionFilter, setSessionFilter] = useSessionState<string>('stats.sessionFilter', 'all')
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lifecycleFilter, setLifecycleFilter] = useSessionState<string[]>('stats.lifecycleFilter', [])
  // Entonnoir d'engagement : ce que deviennent les messages INITIÉS
  // (envoyés → ouverts → réponses → ventes). Même source que l'onglet
  // Automatisations, pour que les deux vues ne se contredisent jamais.
  const [funnel, setFunnel] = useState<{ sent: number; opened: number; responded: number; ordered: number } | null>(null)

  const dateFnsLocale = locale === 'fr' ? fr : enUS
  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  // Toutes les sessions sont WhatsApp (le canal email a été retiré).
  const filteredSessions = sessions

  // Charger la liste des sessions WhatsApp
  useEffect(() => {
    async function loadSessions() {
      try {
        const wRes = await fetch('/api/sessions')
        const wJson = wRes.ok ? await wRes.json() : { data: [] }

        const whatsappSessions: SessionOption[] = (wJson.data || []).map(
          (s: { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }) => ({
            id: s.id,
            instance_name: s.instance_name,
            phone_number: s.phone_number,
            display_name: s.display_name,
          })
        )
        setSessions(whatsappSessions)
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

  // Keep-alive : rafraîchit les stats en revenant sur la page (données à jour
  // sans rechargement manuel, malgré la page gardée montée).
  useKeepAliveFocus('/stats', () => { fetchStats() })

  // Entonnoir : envois initiés → ouverts → réponses → ventes (mêmes données
  // que l'onglet Automatisations). Échec silencieux : l'entonnoir se masque.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/automations/ab-summary?days=${period}`)
        const json = await res.json()
        if (!cancelled && res.ok && json.data?.funnel) setFunnel(json.data.funnel)
      } catch {
        if (!cancelled) setFunnel(null)
      }
    })()
    return () => { cancelled = true }
  }, [period])

  return (
    // ⚠️ Colonne PLEINE HAUTEUR : la Vue globale tient sur un écran sans scroll
    // (desktop). En-tête et onglets restent fixes (`shrink-0`) ; seul le contenu de
    // l'onglet occupe le reste. Le calcul par `100vh` était faux — il ignorait le
    // padding et la barre d'en-tête. Ici le flex répartit tout seul. Sur mobile
    // (`lg:` uniquement), le contenu redéfile normalement.
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div data-tour="stats-header" data-page-header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              <SelectItem value="365">{t('stats.12_months')}</SelectItem>
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
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#25D366] shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
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
        // Le Tabs occupe la hauteur restante ; sa barre d'onglets reste fixe.
        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          {/* Onglets scrollables horizontalement sur mobile (sinon ils debordent) */}
          <div className="-mx-4 shrink-0 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-max gap-1">
              <TabsTrigger value="overview">{t('stats.overview')}</TabsTrigger>
              <TabsTrigger value="automations">{t('stats.automations_tab')}</TabsTrigger>
              <TabsTrigger value="agents">{t('stats.agents_tab')}</TabsTrigger>
              <TabsTrigger value="lifecycle">{t('stats.lifecycle_tab')}</TabsTrigger>
              <TabsTrigger value="contacts">{t('stats.contacts_tab')}</TabsTrigger>
              <TabsTrigger value="optins">{t('stats.optins_tab')}</TabsTrigger>
            </TabsList>
          </div>

          {/* ================================================================ */}
          {/* === Vue globale === */}
          {/* ================================================================ */}
          {/* `mt-6` : de l'air entre les onglets et les cartes, qui étaient collés.
              `flex-1 min-h-0` : ce contenu occupe la hauteur restante → la Vue
              globale tient sur un écran. */}
          <TabsContent value="overview" className="mt-6 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
            <StatsOverviewBoard
              stats={stats}
              locale={locale}
              labels={{
                title: t('stats.title'),
                perDay: t('stats.messages_per_day'),
                aiResponse: t('stats.global_reach'),
              }}
            />
          </TabsContent>

          {/* ================================================================ */}
          {/* === Automatisations (entonnoir + A/B) === */}
          {/* ================================================================ */}
          <TabsContent value="automations" className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <AutomationsBoard days={parseInt(period, 10) || 30} />
          </TabsContent>

          {/* ================================================================ */}
          {/* === Agents IA === */}
          {/* ================================================================ */}
          <TabsContent value="agents" className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {stats.agents.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card">
                <p className="text-muted-foreground">{t('stats.no_agents')}</p>
              </div>
            ) : (
              <>
                {/* Cartes agents défilables horizontalement (gauche/droite) */}
                <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin">
                  {stats.agents.map((agent) => (
                    <div key={agent.id} className="w-[300px] shrink-0 snap-start rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
                      {/* En-tête : icône colorée + nom + badge actif */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
                            <Bot className="h-[18px] w-[18px] text-blue-400" />
                          </span>
                          <span className="truncate text-[15px] font-semibold text-foreground">{agent.name}</span>
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1',
                          agent.isActive ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' : 'bg-muted text-muted-foreground ring-border'
                        )}>
                          {agent.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </div>

                      {/* 4 mini-stats (style Vue globale) */}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          { label: t('stats.messages_processed'), value: <NumberTicker value={agent.messagesHandled} /> },
                          { label: t('stats.conversations'), value: <NumberTicker value={agent.conversationsManaged} /> },
                          { label: t('stats.response_rate'), value: agent.responseRate != null ? `${agent.responseRate}%` : '—' },
                          { label: t('stats.avg_time'), value: agent.avgResponseTime != null ? formatSeconds(agent.avgResponseTime) : '—' },
                        ].map((s, i) => (
                          <div key={i} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                            <p className="text-xl font-bold tracking-tight text-foreground">{s.value}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {agent.hasBookingUrl && (
                        <div className="mt-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                          <p className="text-xl font-bold tracking-tight text-blue-400">{agent.bookingClicks.toLocaleString(numberLocale)}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{t('stats.booking_clicks')}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="mb-4 text-[15px] font-semibold text-foreground">{t('stats.agent_comparison')}</h3>
                  <AgentsComparisonChart data={stats.agents} />
                </div>
              </>
            )}
          </TabsContent>

          {/* ================================================================ */}
          {/* === Lifecycle (Pro & Scale) === */}
          {/* ================================================================ */}
          <TabsContent value="lifecycle" className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto">
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
          {/* === Contacts === */}
          {/* ================================================================ */}
          <TabsContent value="contacts" className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto">
            {/* Première rangée en 2 colonnes : KPI contacts empilés à gauche,
                entonnoir à droite (il est haut, il prend la colonne large).
                Sous lg, tout retombe en une seule colonne. */}
            {/* items-stretch (par défaut) : les deux colonnes prennent la MÊME
                hauteur → la pile de gauche s'aligne sur l'entonnoir de droite. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_2fr]">
            {/* Sur lg, la pile devient un flex vertical dont chaque carte s'étire
                (flex-1) pour remplir à égalité la hauteur de l'entonnoir. */}
            <div className="grid gap-4 sm:grid-cols-3 lg:flex lg:flex-col">
              <KPICard
                className="lg:flex-1"
                title={t('stats.total_contacts')}
                value={stats.overview.totalContacts}
                trend={null}
                icon={Users}
              />
              <KPICard
                className="lg:flex-1"
                title={t('stats.new_contacts')}
                value={stats.overview.newContacts}
                trend={stats.overview.contactsTrend}
                icon={UserPlus}
                color="teal"
              />
              {/* Ventes = commandes attribuées à un message initié (même source
                  que l'entonnoir ci-contre, donc toujours cohérent avec lui).
                  Ce n'est PAS le total des ventes de la boutique. */}
              <KPICard
                className="lg:flex-1"
                title={t('stats.attributed_sales')}
                value={funnel?.ordered ?? 0}
                trend={null}
                icon={ShoppingBag}
                color="green"
              />
            </div>

            {/* Entonnoir d'engagement : envoyés → ouverts → réponses → ventes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('stats.engagement_funnel')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('stats.engagement_funnel_sub')}
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  // L'entonnoir est TOUJOURS rendu, même sans envoi : sa géométrie
                  // est fixe (les valeurs ne sont que du texte), et un entonnoir à
                  // zéro informe mieux qu'un « pas de données » qui laisse un vide.
                  const f = funnel ?? { sent: 0, opened: 0, responded: 0, ordered: 0 }
                  const pct = (n: number) => (f.sent > 0 ? Math.round((n / f.sent) * 100) : 0)
                  return (
                    <>
                      <div className="mx-auto h-72 max-w-2xl">
                        <EngagementFunnel steps={[
                          { label: t('stats.funnel_messages_sent'), value: f.sent },
                          { label: t('stats.funnel_opened'), value: f.opened },
                          { label: t('stats.funnel_responses'), value: f.responded },
                          { label: t('stats.funnel_sales'), value: f.ordered },
                        ]} />
                      </div>
                      {/* Taux clés, rapportés aux messages envoyés */}
                      <div className="mx-auto mt-2 grid max-w-md grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg border p-2">
                          <p className="text-xs text-muted-foreground">{t('stats.funnel_rate_open')}</p>
                          <p className="text-lg font-semibold">{pct(f.opened)} %</p>
                        </div>
                        <div className="rounded-lg border p-2">
                          <p className="text-xs text-muted-foreground">{t('stats.funnel_rate_response')}</p>
                          <p className="text-lg font-semibold">{pct(f.responded)} %</p>
                        </div>
                        <div className="rounded-lg border p-2">
                          <p className="text-xs text-muted-foreground">{t('stats.funnel_rate_sale')}</p>
                          <p className="text-lg font-semibold text-primary">{pct(f.ordered)} %</p>
                        </div>
                      </div>
                      {f.sent === 0 && (
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                          {t('stats.funnel_empty')}
                        </p>
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
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

          {/* ================================================================ */}
          {/* === Opt-in === */}
          {/* ================================================================ */}
          <TabsContent value="optins" className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <OptinsTab period={period} sessionId={sessionFilter} locale={locale} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
