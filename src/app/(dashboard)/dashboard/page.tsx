'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/i18n/context'
import type { StatsResponse } from '@/types/stats'
import type { WhatsAppSession } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  CheckCircle2,
  Circle,
  Sparkles,
  BookOpen,
  Wrench,
  Users2,
  Mail,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { StartTourButton } from '@/components/guided-tour'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/tenant/context'
import { BlobLoader, BlobLoaderScreen } from '@/components/blob-loader'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

type Checklist = {
  whatsapp_connected: boolean
  email_connected: boolean
  agent_created: boolean
  knowledge_created: boolean
  tool_created: boolean
  link_with_agent: boolean
  team_created: boolean
  all_done: boolean
}

// ─── Onboarding Checklist ────────────────────────────────────────────────────

function OnboardingChecklist({ checklist, onRefresh }: { checklist: Checklist; onRefresh: () => void }) {
  const router = useRouter()
  const tenant = useTenant()
  const [seeding, setSeeding] = useState(false)

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/onboarding/seed', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        toast.success('Agent exemple et base de connaissances créés !')
        onRefresh()
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } finally {
      setSeeding(false)
    }
  }

  const steps = [
    {
      key: 'whatsapp_connected' as const,
      label: 'Session WhatsApp',
      description: 'Connectez votre numéro via QR code ou l\'API Meta.',
      icon: Smartphone,
      done: checklist.whatsapp_connected,
      href: '/sessions',
      cta: 'Connecter',
      color: 'from-green-500/20 to-emerald-500/10',
      iconColor: 'text-green-500',
      iconBg: 'bg-green-500/10',
      required: true,
    },
    {
      key: 'agent_created' as const,
      label: 'Agent IA',
      description: 'Créez un agent qui répond automatiquement à vos contacts.',
      icon: Bot,
      done: checklist.agent_created,
      href: '/agents',
      cta: 'Créer',
      color: 'from-violet-500/20 to-purple-500/10',
      iconColor: 'text-violet-500',
      iconBg: 'bg-violet-500/10',
      required: true,
    },
    {
      key: 'knowledge_created' as const,
      label: 'Base de connaissances',
      description: 'Alimentez votre agent avec vos documents et FAQ.',
      icon: BookOpen,
      done: checklist.knowledge_created,
      href: '/knowledge',
      cta: 'Ajouter',
      color: 'from-blue-500/20 to-sky-500/10',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/10',
      required: true,
    },
    {
      key: 'tool_created' as const,
      label: 'Outil connecté',
      description: 'Donnez à votre agent accès à Calendar, CRM ou une API.',
      icon: Wrench,
      done: checklist.tool_created,
      href: '/agents',
      cta: 'Connecter',
      color: 'from-orange-500/20 to-amber-500/10',
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-500/10',
      required: true,
    },
    {
      key: 'link_with_agent' as const,
      label: 'Lien WhatsApp',
      description: 'Un lien trackable qui déclenche une conversation avec un agent.',
      icon: Link2,
      done: checklist.link_with_agent,
      href: '/links',
      cta: 'Créer',
      color: 'from-teal-500/20 to-cyan-500/10',
      iconColor: 'text-teal-500',
      iconBg: 'bg-teal-500/10',
      required: true,
    },
    {
      key: 'team_created' as const,
      label: 'Équipe',
      description: 'Invitez vos collaborateurs et gérez leurs accès.',
      icon: Users2,
      done: checklist.team_created,
      href: '/teams',
      cta: 'Créer',
      color: 'from-pink-500/20 to-rose-500/10',
      iconColor: 'text-pink-500',
      iconBg: 'bg-pink-500/10',
      required: true,
    },
    {
      key: 'email_connected' as const,
      label: 'Session Email',
      description: 'Gérez vos emails depuis le même inbox que WhatsApp.',
      icon: Mail,
      done: checklist.email_connected,
      href: '/sessions',
      cta: 'Connecter',
      color: 'from-indigo-500/20 to-blue-500/10',
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10',
      required: false,
    },
  ]

  const requiredSteps = steps.filter((s) => s.required)
  const doneCount = requiredSteps.filter((s) => s.done).length
  const totalRequired = requiredSteps.length
  const progress = Math.round((doneCount / totalRequired) * 100)
  const showSeedButton = !checklist.agent_created || !checklist.knowledge_created

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-6">

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 border border-primary/20 p-6 md:p-8">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,white)]" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👋</span>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Bienvenue sur {tenant.appName}</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Suivez ces étapes pour configurer votre plateforme et commencer à automatiser vos conversations WhatsApp avec l'IA.
            </p>
            <div className="flex flex-col gap-2 mt-2 items-start">
              {showSeedButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSeed}
                  disabled={seeding}
                  className="gap-1.5 border-primary/40 bg-background/60 hover:bg-background w-full sm:w-auto"
                >
                  {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                  <span className="truncate">Créer un agent et une base de connaissances exemples</span>
                </Button>
              )}
              <StartTourButton className="border-primary/40 bg-background/60 hover:bg-background" />
            </div>
          </div>

          {/* Cercle de progression */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative h-24 w-24">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{progress}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{doneCount}/{totalRequired} étapes</p>
          </div>
        </div>
      </div>

      {/* Grille des étapes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {steps.filter(s => s.required).map((step, idx) => {
          const Icon = step.icon
          return (
            <div
              key={step.key}
              className={cn(
                'relative group rounded-xl border p-4 transition-all duration-200',
                step.done
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-card border-border hover:border-primary/30 hover:shadow-md cursor-pointer'
              )}
              onClick={() => !step.done && router.push(step.href)}
            >
              {/* Numéro */}
              <div className={cn(
                'absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {step.done ? '✓' : idx + 1}
              </div>

              {/* Icône */}
              <div className={cn(
                'mb-3 flex h-10 w-10 items-center justify-center rounded-xl',
                step.done ? 'bg-primary/10' : step.iconBg
              )}>
                {step.done
                  ? <CheckCircle2 className="h-5 w-5 text-primary" />
                  : <Icon className={cn('h-5 w-5', step.iconColor)} />
                }
              </div>

              {/* Texte */}
              <p className={cn(
                'text-sm font-semibold mb-1',
                step.done && 'text-muted-foreground'
              )}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step.description}
              </p>

              {/* CTA */}
              {!step.done && (
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {step.cta} <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bonus email */}
      <div
        className={cn(
          'flex items-center gap-4 rounded-xl border border-dashed p-4 transition-all',
          checklist.email_connected
            ? 'border-primary/20 bg-primary/5'
            : 'border-muted-foreground/20 hover:border-primary/30 cursor-pointer'
        )}
        onClick={() => !checklist.email_connected && router.push('/sessions')}
      >
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          checklist.email_connected ? 'bg-primary/10' : 'bg-muted'
        )}>
          {checklist.email_connected
            ? <CheckCircle2 className="h-5 w-5 text-primary" />
            : <Mail className="h-5 w-5 text-muted-foreground" />
          }
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('text-sm font-medium', checklist.email_connected && 'text-muted-foreground')}>
              Session Email
            </p>
            <Badge variant="secondary" className="text-[10px]">Bonus</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Gérez vos emails depuis le même inbox que WhatsApp.</p>
        </div>
        {!checklist.email_connected && (
          <Button size="sm" variant="outline" className="shrink-0">Connecter</Button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Une fois toutes les étapes complétées, votre tableau de bord de statistiques s'affichera automatiquement.
      </p>
    </div>
  )
}

// ─── Dashboard Stats (ancien dashboard) ──────────────────────────────────────

function StatsDashboard() {
  const { t, locale } = useTranslation()
  const tenant = useTenant()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [statsRes, sessionsRes] = await Promise.all([
          fetch('/api/stats?period=7'),
          fetch('/api/sessions'),
        ])
        const statsJson = await statsRes.json()
        const sessionsJson = await sessionsRes.json()
        if (statsRes.ok && statsJson.data) setStats(statsJson.data)
        if (sessionsRes.ok && sessionsJson.data) setSessions(sessionsJson.data)
      } catch {
        toast.error(t('dashboard.load_error'))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const connectedSessions = sessions.filter((s) => s.status === 'connected').length
  const activeAgents = stats?.agents.filter((a) => a.isActive).length ?? 0
  const totalAgents = stats?.agents.length ?? 0
  const activeLinks = stats?.links.filter((l) => l.isActive).length ?? 0
  const totalLinks = stats?.links.length ?? 0

  const totalClicks = stats?.links.reduce((s, l) => s + l.totalClicks, 0) ?? 0

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <BlobLoader size={88} />
        </div>
      ) : stats ? (
        <>
          {/* ═══ Ligne 1 : HÉRO sombre + glow vert (gauche) | graphe messages (droite) ═══ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

            {/* HÉRO — carte separee en deux (facon "Total Profit") : zone principale
                a gauche + section verte detachee a droite avec encoche arrondie */}
            <div data-tour="header" className="relative flex overflow-hidden rounded-[32px] border border-primary/25 bg-card shadow-[0_0_0_1px_rgba(125,194,165,0.06),0_20px_60px_-20px_rgba(125,194,165,0.35)] lg:col-span-5">
              {/* glows */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.14] via-transparent to-transparent" />
              <div className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />

              {/* Zone principale (gauche) */}
              <div className="relative flex min-w-0 flex-1 flex-col p-6 md:p-8">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{t('dashboard.greeting')}</p>
                  <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground md:text-3xl">{tenant.appName}</h1>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-4 pt-8">
                  <div>
                    <p className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{stats.overview.totalMessages.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.messages')}</p>
                  </div>
                  <div className="border-l border-border pl-4">
                    <p className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{stats.overview.activeConversations.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.conversations')}</p>
                  </div>
                </div>
              </div>

              {/* Section detachee (droite) avec encoche arrondie + point + valeur */}
              <div className="relative z-10 my-3 mr-3 flex w-[34%] shrink-0 flex-col justify-between rounded-[26px] bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground shadow-lg md:p-5">
                {/* point statut en haut a droite */}
                <span className="absolute right-4 top-4 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground/60 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-foreground" />
                </span>
                <p className="text-[10px] font-medium uppercase tracking-wider text-primary-foreground/70">{t('dashboard.ai_rate')}</p>
                <div className="mt-auto">
                  <p className="text-3xl font-bold leading-none md:text-4xl">{stats.overview.responseRate ?? 0}<span className="text-xl">%</span></p>
                  <p className="mt-1 text-[11px] text-primary-foreground/70">{connectedSessions}/{sessions.length} {t('dashboard.whatsapp_sessions')}</p>
                </div>
              </div>
            </div>

            {/* Graphe messages par jour */}
            <div className="overflow-hidden rounded-[28px] border bg-card p-5 shadow-sm md:p-6 lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('dashboard.messages_per_day')}</h3>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
              <MessagesChart data={stats.charts.messagesOverTime} />
            </div>
          </div>

          {/* ═══ Ligne 2 : 4 KPI ronds ═══ */}
          <div data-tour="kpi-cards" className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <BentoKPI title={t('dashboard.messages')} value={stats.overview.totalMessages} trend={stats.overview.messagesTrend} icon={MessageSquare} color="green" locale={locale} />
            <BentoKPI title={t('dashboard.conversations')} value={stats.overview.activeConversations} trend={stats.overview.conversationsTrend} icon={Users} color="blue" locale={locale} />
            <BentoKPI title={t('dashboard.new_contacts')} value={stats.overview.newContacts} trend={stats.overview.contactsTrend} icon={UserPlus} color="coral" locale={locale} />
            <BentoKPI title={t('dashboard.ai_rate')} value={stats.overview.responseRate ?? 0} trend={null} icon={Zap} formatValue={(v) => `${v}%`} color="orange" locale={locale} />
          </div>

          {/* ═══ Ligne 3 : répartition (barres) | graphe conversations ═══ */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Répartition envoyés / reçus */}
            <div className="rounded-[28px] border bg-card p-5 shadow-sm md:p-6 lg:col-span-2">
              <h3 className="mb-5 text-sm font-semibold">{t('dashboard.messages')}</h3>
              {(() => {
                const inbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.inbound, 0)
                const outbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.outbound, 0)
                const total = inbound + outbound || 1
                const pctIn = Math.round((inbound / total) * 100)
                const pctOut = 100 - pctIn
                return (
                  <div className="space-y-5">
                    <Ratio label={t('dashboard.received')} value={inbound} pct={pctIn} barClass="bg-primary" locale={locale} />
                    <Ratio label={t('dashboard.sent')} value={outbound} pct={pctOut} barClass="bg-[#F0998A]" locale={locale} />
                    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <Clock className="h-4 w-4" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0
                          ? t('dashboard.avg_response_time', { time: formatSeconds(stats.overview.avgResponseTime) })
                          : t('dashboard.ai_performance')}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Graphe conversations */}
            <div className="rounded-[28px] border bg-card p-5 shadow-sm md:p-6 lg:col-span-3">
              <h3 className="mb-4 text-sm font-semibold">{t('dashboard.new_conversations')}</h3>
              <TimeSeriesChart data={stats.charts.conversationsOverTime} title="" color="var(--accent, #40E9BE)" />
            </div>
          </div>

          {/* ═══ Ligne 4 : 3 quick stats ═══ */}
          <div data-tour="quick-stats" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <QuickStatCard href="/sessions" icon={Smartphone} label={t('dashboard.whatsapp_sessions')} value={`${connectedSessions}/${sessions.length}`} status={connectedSessions > 0 ? 'success' : 'inactive'} statusLabel={connectedSessions > 0 ? t('dashboard.connected') : t('dashboard.none_female')} />
            <QuickStatCard href="/agents" icon={Bot} label={t('dashboard.ai_agents')} value={`${activeAgents}/${totalAgents}`} status={activeAgents > 0 ? 'success' : 'inactive'} statusLabel={activeAgents > 0 ? t('common.active') : t('dashboard.none_male')} subtitle={stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0 ? t('dashboard.avg_time', { time: formatSeconds(stats.overview.avgResponseTime) }) : undefined} />
            <QuickStatCard href="/links" icon={Link2} label={t('dashboard.whatsapp_links')} value={`${activeLinks}/${totalLinks}`} status={activeLinks > 0 ? 'success' : 'inactive'} statusLabel={activeLinks > 0 ? t('common.active') : t('dashboard.none_male')} subtitle={totalLinks > 0 ? `${totalClicks.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} ${t('dashboard.clicks')}` : undefined} />
          </div>

          {/* ═══ Carte CTA contextuelle ═══ */}
          <DashboardCTA
            connectedSessions={connectedSessions}
            activeAgents={activeAgents}
            t={t}
          />
        </>
      ) : null}
    </div>
  )
}

// ─── Ratio — barre de répartition (envoyés / reçus) ──────────────────────────

function Ratio({ label, value, pct, barClass, locale }: {
  label: string; value: number; pct: number; barClass: string; locale: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{value.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}</span> · {pct}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Carte CTA contextuelle ──────────────────────────────────────────────────

function DashboardCTA({ connectedSessions, activeAgents, t }: {
  connectedSessions: number; activeAgents: number; t: (key: string) => string
}) {
  // Guide vers l'action manquante la plus prioritaire
  const cta = connectedSessions === 0
    ? { href: '/sessions', title: t('dashboard.cta_connect_title'), desc: t('dashboard.cta_connect_desc'), btn: t('dashboard.cta_connect_btn'), icon: Smartphone }
    : activeAgents === 0
      ? { href: '/agents', title: t('dashboard.cta_agent_title'), desc: t('dashboard.cta_agent_desc'), btn: t('dashboard.cta_agent_btn'), icon: Bot }
      : { href: '/stats', title: t('dashboard.cta_explore_title'), desc: t('dashboard.cta_explore_desc'), btn: t('dashboard.cta_explore_btn'), icon: Sparkles }
  return (
    <div className="group/cta relative mt-4 overflow-visible rounded-[32px] border border-primary/30 bg-gradient-to-br from-primary via-primary to-primary/75 p-6 shadow-[0_24px_60px_-20px_rgba(125,194,165,0.6)] md:p-8">
      {/* Fond : grand glow + motif de points (radial) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[#F0998A]/25 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '18px 18px', color: '#fff' }}
        />
      </div>

      {/* Mascotte dynamique qui deborde en haut a droite (effet wow) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mascot-action.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-10 right-2 z-10 hidden h-[210px] w-auto max-w-none drop-shadow-[0_18px_30px_rgba(0,0,0,0.4)] transition-transform duration-500 ease-out group-hover/cta:-translate-y-2 group-hover/cta:rotate-3 sm:block md:right-8 md:h-[240px]"
      />

      <div className="relative z-20 max-w-[62%] text-primary-foreground sm:max-w-[60%]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          Autyvia
        </span>
        <h3 className="mt-3 text-2xl font-bold leading-tight tracking-tight md:text-3xl">{cta.title}</h3>
        <p className="mt-1.5 text-sm text-primary-foreground/80 md:text-base">{cta.desc}</p>
        <Link href={cta.href} className="mt-5 inline-block">
          <button className="flex items-center gap-2 rounded-2xl bg-primary-foreground px-6 py-3 text-sm font-bold text-primary shadow-lg transition-all hover:scale-[1.03] active:scale-[0.98]">
            {cta.btn}
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChecklist = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/checklist')
      const json = await res.json()
      if (res.ok) setChecklist(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChecklist()
  }, [fetchChecklist])

  if (loading) {
    return <BlobLoaderScreen />
  }

  if (!checklist || checklist.all_done) {
    return <StatsDashboard />
  }

  return <OnboardingChecklist checklist={checklist} onRefresh={fetchChecklist} />
}

// ─── QuickStatCard ────────────────────────────────────────────────────────────

// ─── BentoKPI — tuile KPI arrondie pour la grille bento ───────────────────────

const BENTO_KPI_COLORS = {
  green: { bg: 'bg-primary/10', icon: 'text-primary', ring: 'border-primary/15', accent: '' },
  blue: { bg: 'bg-blue-500/10', icon: 'text-blue-500', ring: 'border-blue-500/15', accent: '' },
  teal: { bg: 'bg-sky-500/10', icon: 'text-sky-500', ring: 'border-sky-500/15', accent: '' },
  orange: { bg: 'bg-orange-500/10', icon: 'text-orange-500', ring: 'border-orange-500/15', accent: '' },
  // Accent corail (facon maquette) — fond teinté pour ressortir
  coral: { bg: 'bg-[#F0998A]/20', icon: 'text-[#E07B6A]', ring: 'border-[#F0998A]/30', accent: 'bg-[#F0998A]/[0.07]' },
}

function BentoKPI({ title, value, trend, icon: Icon, formatValue, color = 'green', locale }: {
  title: string; value: number; trend?: number | null; icon: React.ElementType
  formatValue?: (value: number) => string; color?: 'green' | 'blue' | 'teal' | 'orange' | 'coral'; locale: string
}) {
  const c = BENTO_KPI_COLORS[color]
  return (
    <div className={cn('flex flex-col justify-between rounded-[24px] border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', c.ring, c.accent || 'bg-card')}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', c.bg)}>
          <Icon className={cn('h-4 w-4', c.icon)} />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold tracking-tight">{formatValue ? formatValue(value) : value.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}</p>
        {trend != null && (
          <div className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            trend > 0 ? 'bg-emerald-500/10 text-emerald-600' : trend < 0 ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground')}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{trend > 0 ? '+' : ''}{trend}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── QuickStatCard ────────────────────────────────────────────────────────────

function QuickStatCard({ href, icon: Icon, label, value, status, statusLabel, subtitle }: {
  href: string; icon: React.ElementType; label: string; value: string
  status: 'success' | 'inactive'; statusLabel: string; subtitle?: string
}) {
  return (
    <Link href={href} className="group flex flex-1 items-center justify-between rounded-[24px] border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', status === 'success' ? 'bg-primary/10' : 'bg-muted')}>
          <Icon className={cn('h-5 w-5', status === 'success' ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{value}</span>
            <Badge variant={status === 'success' ? 'default' : 'secondary'} className={cn('text-[10px] px-1.5', status === 'success' && 'bg-primary hover:bg-primary/80')}>
              {statusLabel}
            </Badge>
          </div>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
