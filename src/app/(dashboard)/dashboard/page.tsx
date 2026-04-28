'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/i18n/context'
import type { StatsResponse } from '@/types/stats'
import type { WhatsAppSession } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  CheckCircle2,
  Circle,
  Sparkles,
  BookOpen,
  Wrench,
  Users2,
  Mail,
  ExternalLink,
} from 'lucide-react'
import { StartTourButton } from '@/components/guided-tour'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

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
      label: 'Connecter une session WhatsApp',
      description: 'Scannez un QR code ou connectez via l\'API Meta pour recevoir des messages.',
      icon: Smartphone,
      done: checklist.whatsapp_connected,
      href: '/sessions',
      cta: 'Connecter',
      required: true,
    },
    {
      key: 'agent_created' as const,
      label: 'Créer un agent IA',
      description: 'Un qualificateur répond à tous les messages, un agent conversation répond après qualification.',
      icon: Bot,
      done: checklist.agent_created,
      href: '/agents',
      cta: 'Créer un agent',
      required: true,
    },
    {
      key: 'knowledge_created' as const,
      label: 'Ajouter une base de connaissances',
      description: 'Alimentez votre agent avec vos documents, FAQ, fiches produits pour des réponses précises.',
      icon: BookOpen,
      done: checklist.knowledge_created,
      href: '/knowledge',
      cta: 'Ajouter des documents',
      required: true,
    },
    {
      key: 'tool_created' as const,
      label: 'Connecter un outil',
      description: 'Donnez à votre agent accès à Google Calendar, un CRM, Sheets ou votre propre API.',
      icon: Wrench,
      done: checklist.tool_created,
      href: '/agents',
      cta: 'Ajouter un outil',
      required: true,
    },
    {
      key: 'link_with_agent' as const,
      label: 'Créer un lien WhatsApp avec agent',
      description: 'Un lien trackable qui déclenche une conversation automatique avec un agent IA.',
      icon: Link2,
      done: checklist.link_with_agent,
      href: '/links',
      cta: 'Créer un lien',
      required: true,
    },
    {
      key: 'team_created' as const,
      label: 'Créer une équipe',
      description: 'Invitez des collaborateurs et gérez leurs accès aux sessions et conversations.',
      icon: Users2,
      done: checklist.team_created,
      href: '/teams',
      cta: 'Créer une équipe',
      required: true,
    },
    {
      key: 'email_connected' as const,
      label: 'Connecter une session Email',
      description: 'Gérez vos emails entrants depuis le même inbox que WhatsApp.',
      icon: Mail,
      done: checklist.email_connected,
      href: '/sessions',
      cta: 'Connecter un email',
      required: false,
    },
  ]

  const requiredSteps = steps.filter((s) => s.required)
  const doneCount = requiredSteps.filter((s) => s.done).length
  const totalRequired = requiredSteps.length
  const progress = Math.round((doneCount / totalRequired) * 100)

  const showSeedButton = !checklist.agent_created || !checklist.knowledge_created

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20 md:pb-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Bienvenue sur Autyvia 👋</h1>
        <p className="text-sm text-muted-foreground">
          Complétez ces étapes pour commencer à automatiser vos conversations.
        </p>
      </div>

      {/* Barre de progression */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{doneCount}/{totalRequired} étapes complétées</span>
          <span className="font-medium text-primary">{progress}%</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Étapes */}
      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.key}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 transition-colors',
                step.done
                  ? 'bg-primary/5 border-primary/20'
                  : step.required
                    ? 'bg-card border-border hover:border-primary/30'
                    : 'bg-muted/30 border-dashed border-muted-foreground/30'
              )}
            >
              <div className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                step.done ? 'bg-primary/10' : 'bg-muted'
              )}>
                {step.done
                  ? <CheckCircle2 className="h-5 w-5 text-primary" />
                  : <Icon className="h-4 w-4 text-muted-foreground" />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={cn('text-sm font-medium', step.done && 'line-through text-muted-foreground')}>
                    {step.label}
                  </p>
                  {!step.required && (
                    <Badge variant="secondary" className="text-[10px]">Bonus</Badge>
                  )}
                </div>
                {!step.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>

              {!step.done && (
                <Button
                  size="sm"
                  variant={step.required ? 'default' : 'outline'}
                  className="shrink-0 gap-1.5"
                  onClick={() => router.push(step.href)}
                >
                  {step.cta}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Bouton créer exemples */}
      {showSeedButton && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Démarrer avec un exemple</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Créez automatiquement un agent qualificateur et une base de connaissances pré-remplie pour tester la plateforme.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSeed}
            disabled={seeding}
            className="shrink-0 gap-1.5"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Créer les exemples
          </Button>
        </div>
      )}

      {/* Aide */}
      <p className="text-center text-xs text-muted-foreground">
        Une fois toutes les étapes complétées, votre tableau de bord de statistiques s'affichera ici.
      </p>
    </div>
  )
}

// ─── Dashboard Stats (ancien dashboard) ──────────────────────────────────────

function StatsDashboard() {
  const { t, locale } = useTranslation()
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

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20 md:pb-6">
      <div data-tour="header" className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t('dashboard.greeting')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.overview')}</p>
        </div>
        <StartTourButton />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <>
          <div data-tour="kpi-cards" className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <KPICard title={t('dashboard.messages')} value={stats.overview.totalMessages} trend={stats.overview.messagesTrend} icon={MessageSquare} color="green" />
            <KPICard title={t('dashboard.conversations')} value={stats.overview.activeConversations} trend={stats.overview.conversationsTrend} icon={Users} color="blue" />
            <KPICard title={t('dashboard.new_contacts')} value={stats.overview.newContacts} trend={stats.overview.contactsTrend} icon={UserPlus} color="teal" />
            <KPICard title={t('dashboard.ai_rate')} value={stats.overview.responseRate ?? 0} trend={null} icon={Zap} formatValue={(v) => `${v}%`} color="orange" />
          </div>

          <div data-tour="quick-stats" className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <QuickStatCard href="/sessions" icon={Smartphone} label={t('dashboard.whatsapp_sessions')} value={`${connectedSessions}/${sessions.length}`} status={connectedSessions > 0 ? 'success' : 'inactive'} statusLabel={connectedSessions > 0 ? t('dashboard.connected') : t('dashboard.none_female')} />
            <QuickStatCard href="/agents" icon={Bot} label={t('dashboard.ai_agents')} value={`${activeAgents}/${totalAgents}`} status={activeAgents > 0 ? 'success' : 'inactive'} statusLabel={activeAgents > 0 ? t('common.active') : t('dashboard.none_male')} subtitle={stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0 ? t('dashboard.avg_time', { time: formatSeconds(stats.overview.avgResponseTime) }) : undefined} />
            <QuickStatCard href="/links" icon={Link2} label={t('dashboard.whatsapp_links')} value={`${activeLinks}/${totalLinks}`} status={activeLinks > 0 ? 'success' : 'inactive'} statusLabel={activeLinks > 0 ? t('common.active') : t('dashboard.none_male')} subtitle={totalLinks > 0 ? `${stats.links.reduce((s, l) => s + l.totalClicks, 0).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} ${t('dashboard.clicks')}` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 md:p-6">
              <h3 className="text-sm font-semibold mb-4">{t('dashboard.messages_per_day')}</h3>
              <MessagesChart data={stats.charts.messagesOverTime} />
            </div>
            <div className="rounded-xl border bg-card p-4 md:p-6">
              <h3 className="text-sm font-semibold mb-4">{t('dashboard.new_conversations')}</h3>
              <TimeSeriesChart data={stats.charts.conversationsOverTime} title="" color="var(--accent, #40E9BE)" />
            </div>
          </div>

          {stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0 && (
            <div className="rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t('dashboard.ai_performance')}</p>
                  <p className="text-xs text-muted-foreground">{t('dashboard.avg_response_time', { time: formatSeconds(stats.overview.avgResponseTime) })}</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
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
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!checklist || checklist.all_done) {
    return <StatsDashboard />
  }

  return <OnboardingChecklist checklist={checklist} onRefresh={fetchChecklist} />
}

// ─── QuickStatCard ────────────────────────────────────────────────────────────

function QuickStatCard({ href, icon: Icon, label, value, status, statusLabel, subtitle }: {
  href: string; icon: React.ElementType; label: string; value: string
  status: 'success' | 'inactive'; statusLabel: string; subtitle?: string
}) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
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
