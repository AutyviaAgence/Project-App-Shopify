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
  Loader2,
  Smartphone,
  Bot,
  Link2,
  ArrowRight,
  CheckCircle2,
  Circle,
  Sparkles,
  BookOpen,
  Wrench,
  Users2,
  Mail,
  ExternalLink,
  ArrowUpRight,
  Users,
  UserPlus,
  Zap,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { StartTourButton } from '@/components/guided-tour'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/tenant/context'
import { BlobLoader, BlobLoaderScreen } from '@/components/blob-loader'

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

  return (
    <div className="flex flex-col gap-4 p-4 pb-20 md:h-full md:gap-3 md:overflow-hidden md:p-5 md:pb-5">
      {loading ? (
        <div className="flex h-64 flex-1 items-center justify-center">
          <BlobLoader size={88} />
        </div>
      ) : stats ? (
        <>
          {/* En-tete page — pr reserve a droite pour ne pas passer sous la cloche */}
          <div data-tour="header" data-page-header className="flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.greeting')}</p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{tenant.appName}</h1>
            </div>
            <Link href="/stats" className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex">
              {t('dashboard.overview')}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {/* ═══ Ligne 1 : graphe Messages + 3 KPI verts ═══ */}
          <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
            {/* Carte principale Messages */}
            <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-8">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-sm text-muted-foreground">{t('dashboard.messages_per_day')}</h3>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{stats.overview.totalMessages.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MessagesChart data={stats.charts.messagesOverTime} height="100%" />
              </div>
            </div>

            {/* 3 KPI compacts */}
            <div className="grid grid-cols-3 gap-3 lg:col-span-4 lg:grid-cols-1">
              <MiniKPI icon={Users} label={t('dashboard.conversations')} value={stats.overview.activeConversations.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} trend={stats.overview.conversationsTrend} />
              <MiniKPI icon={UserPlus} label={t('dashboard.new_contacts')} value={stats.overview.newContacts.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} trend={stats.overview.contactsTrend} />
              <MiniKPI icon={Zap} label={t('dashboard.ai_rate')} value={`${stats.overview.responseRate ?? 0}%`} trend={null} />
            </div>
          </div>

          {/* ═══ Ligne 2 : Funnel engagement + graphe conversations + CTA mascotte ═══ */}
          <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
            {/* Funnel d'engagement (variable universelle) */}
            <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{t('dashboard.engagement_funnel')}</h3>
                  <p className="truncate text-xs text-muted-foreground">{t('dashboard.engagement_funnel_sub')}</p>
                </div>
                <Link href="/stats" className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {(() => {
                  const inbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.inbound, 0)
                  const outbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.outbound, 0)
                  const steps = [
                    { label: t('dashboard.contacts'), value: stats.overview.totalContacts },
                    { label: t('dashboard.conversations'), value: stats.overview.totalConversations },
                    { label: t('dashboard.received'), value: inbound },
                    { label: t('dashboard.replied'), value: outbound },
                  ]
                  return steps[0].value === 0 && steps[1].value === 0
                    ? <p className="text-sm text-muted-foreground">{t('dashboard.no_data')}</p>
                    : <EngagementFunnel steps={steps} />
                })()}
              </div>
            </div>

            {/* Graphe conversations */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-4">
              <h3 className="mb-2 text-sm font-semibold">{t('dashboard.new_conversations')}</h3>
              <div className="min-h-0 flex-1">
                <TimeSeriesChart data={stats.charts.conversationsOverTime} title="" color="var(--accent, #40E9BE)" height="100%" />
              </div>
              {/* mini repartition recus/envoyes en pied */}
              {(() => {
                const inbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.inbound, 0)
                const outbound = stats.charts.messagesOverTime.reduce((s, p) => s + p.outbound, 0)
                const total = inbound + outbound || 1
                const pctIn = Math.round((inbound / total) * 100)
                return (
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />{t('dashboard.received')} {pctIn}%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/50" />{t('dashboard.sent')} {100 - pctIn}%</span>
                  </div>
                )
              })()}
            </div>

            {/* CTA verte + mascotte qui depasse en haut */}
            <div className="pt-8 lg:col-span-4 lg:pt-0">
              <DashboardCTA
                connectedSessions={connectedSessions}
                activeAgents={activeAgents}
                t={t}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── MiniKPI — carte stat compacte avec mini-graphe de fond ──────────────────

function MiniKPI({ icon: Icon, label, value, trend }: {
  icon: React.ElementType
  label: string
  value: string
  trend?: number | null
}) {
  return (
    <div className="relative flex flex-1 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
      </div>
      {trend != null && (
        <span className={cn('shrink-0 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
          trend > 0 ? 'bg-emerald-500/10 text-emerald-500' : trend < 0 ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground')}>
          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
  )
}

// ─── EngagementFunnel — entonnoir d'engagement (variable universelle) ─────────

function EngagementFunnel({ steps }: { steps: { label: string; value: number }[] }) {
  // Reprise EXACTE de la maquette ai_automation_hub_funnel_v11.svg :
  // memes polygons, memes couleurs, memes lignes+points+pills. Seuls les textes
  // des pills sont remplaces par nos donnees (label + valeur).
  // Geometrie du SVG d'origine, recadree sur le funnel (x 150..530, y 150..488).
  const labels = steps.map((s) => s.label)
  const values = steps.map((s) => s.value.toLocaleString('fr-FR'))

  return (
    <div className="h-full w-full">
      <svg viewBox="140 140 600 358" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* ── Trapezes (identiques a la maquette v11) ── */}
        <g>
          <polygon points="150,150 530,150 482,235 198,235" fill="#5FE6CB" />
          <polygon points="150,150 530,150 524,162 156,162" fill="#7DF0DC" opacity="0.7" />

          <polygon points="198,241 482,241 412,326 268,326" fill="#3DCBAE" />
          <polygon points="198,241 482,241 476,253 204,253" fill="#5FE6CB" opacity="0.7" />

          <polygon points="268,332 412,332 372,400 308,400" fill="#28AC92" />
          <polygon points="268,332 412,332 406,344 274,344" fill="#3DCBAE" opacity="0.7" />

          <polygon points="308,406 372,406 372,488 308,462" fill="#1B8C77" />
          <polygon points="308,406 372,406 372,418 308,418" fill="#28AC92" opacity="0.7" />
        </g>

        {/* ── Etiquettes (ligne + point + pill), textes = nos donnees ── */}
        {/* Etage 1 */}
        <g>
          <line x1="540" y1="175" x2="610" y2="175" stroke="#2A3645" strokeWidth="2" />
          <circle cx="610" cy="175" r="6" fill="#2DD4BF" />
          <rect x="630" y="151" width="100" height="48" rx="10" fill="#1A2433" stroke="#2A3645" strokeWidth="1" />
          <text x="680" y="173" fill="#8A95A5" fontSize="13" fontWeight="400" textAnchor="middle">{labels[0]}</text>
          <text x="680" y="190" fill="#2DD4BF" fontSize="16" fontWeight="700" textAnchor="middle">{values[0]}</text>
        </g>
        {/* Etage 2 */}
        {labels[1] != null && (
          <g>
            <line x1="490" y1="280" x2="560" y2="280" stroke="#2A3645" strokeWidth="2" />
            <circle cx="560" cy="280" r="6" fill="#2DD4BF" />
            <rect x="580" y="256" width="100" height="48" rx="10" fill="#1A2433" stroke="#2A3645" strokeWidth="1" />
            <text x="630" y="278" fill="#8A95A5" fontSize="13" fontWeight="400" textAnchor="middle">{labels[1]}</text>
            <text x="630" y="295" fill="#2DD4BF" fontSize="16" fontWeight="700" textAnchor="middle">{values[1]}</text>
          </g>
        )}
        {/* Etage 3 */}
        {labels[2] != null && (
          <g>
            <line x1="420" y1="366" x2="490" y2="366" stroke="#2A3645" strokeWidth="2" />
            <circle cx="490" cy="366" r="6" fill="#2DD4BF" />
            <rect x="510" y="342" width="100" height="48" rx="10" fill="#1A2433" stroke="#2A3645" strokeWidth="1" />
            <text x="560" y="364" fill="#8A95A5" fontSize="13" fontWeight="400" textAnchor="middle">{labels[2]}</text>
            <text x="560" y="381" fill="#2DD4BF" fontSize="16" fontWeight="700" textAnchor="middle">{values[2]}</text>
          </g>
        )}
        {/* Etage 4 */}
        {labels[3] != null && (
          <g>
            <line x1="402" y1="431" x2="472" y2="431" stroke="#2A3645" strokeWidth="2" />
            <circle cx="472" cy="431" r="6" fill="#2DD4BF" />
            <rect x="492" y="407" width="100" height="48" rx="10" fill="#1A2433" stroke="#2A3645" strokeWidth="1" />
            <text x="542" y="429" fill="#8A95A5" fontSize="13" fontWeight="400" textAnchor="middle">{labels[3]}</text>
            <text x="542" y="446" fill="#2DD4BF" fontSize="16" fontWeight="700" textAnchor="middle">{values[3]}</text>
          </g>
        )}
      </svg>
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
    <div className="group/cta relative flex h-full min-h-[220px] flex-col justify-between overflow-visible rounded-3xl bg-gradient-to-br from-[#8fd4b6] via-primary to-[#5fb592] p-6 shadow-[0_10px_30px_-8px_rgba(125,194,165,0.55)]">
      {/* Halo decoratif + leger motif */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '15px 15px' }}
        />
      </div>

      {/* Mascotte qui depasse en haut a droite */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mascot-action.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-12 z-20 h-32 w-auto max-w-none object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.25)] transition-transform duration-500 ease-out group-hover/cta:-translate-y-1 group-hover/cta:rotate-3 sm:h-36"
      />

      {/* Texte */}
      <div className="relative z-10 max-w-[80%] text-[#0d2a1f]">
        <h3 className="text-xl font-extrabold leading-tight tracking-tight md:text-2xl">{cta.title}</h3>
        <p className="mt-2 text-sm font-medium text-[#0d2a1f]/75">{cta.desc}</p>
      </div>

      {/* Bouton blanc */}
      <Link href={cta.href} className="relative z-10 mt-4 inline-block">
        <button className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0d6b4e] shadow-md transition-all hover:scale-[1.03] active:scale-[0.98]">
          {cta.btn}
          <ArrowRight className="h-4 w-4" />
        </button>
      </Link>
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

