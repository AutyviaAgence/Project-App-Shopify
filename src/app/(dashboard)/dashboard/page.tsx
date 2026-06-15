'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/i18n/context'
import type { StatsResponse } from '@/types/stats'
import type { WhatsAppSession } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { toast } from 'sonner'
import {
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
} from 'lucide-react'
import { StartTourButton } from '@/components/guided-tour'
import { WhatsAppConnect } from '@/components/whatsapp-connect'
import { EmailConnect } from '@/components/email-connect'
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
      label: 'WhatsApp Business',
      description: 'Connectez votre numéro via l\'API Meta.',
      icon: Smartphone,
      done: checklist.whatsapp_connected,
      href: '/dashboard',
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
      href: '/dashboard',
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

      {/* Connexions canaux (remplacent la page Sessions) */}
      <WhatsAppConnect />
      <EmailConnect />

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
        onClick={() => !checklist.email_connected && router.push('/dashboard')}
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
  const { t } = useTranslation()
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

          {/* Connexions canaux (remplacent la page Sessions) */}
          <div className="grid gap-3 md:grid-cols-2">
            <WhatsAppConnect />
            <EmailConnect />
          </div>

          {/* ═══ Bloc action : statut IA + CTA (les stats détaillées sont dans /stats) ═══ */}
          <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
            {/* CTA verte + mascotte */}
            <div className="min-h-0 lg:col-span-8">
              <DashboardCTA
                connectedSessions={connectedSessions}
                activeAgents={activeAgents}
                t={t}
              />
            </div>

            {/* Statut IA + accès aux statistiques */}
            <div className="flex min-h-0 flex-col gap-3 lg:col-span-4">
              <AIStatusKPI label={t('dashboard.ai_online')} active={activeAgents} total={stats.agents.length} />
              <Link
                href="/stats"
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{t('dashboard.overview')}</h3>
                  <p className="truncate text-xs text-muted-foreground">{t('dashboard.engagement_funnel_sub')}</p>
                </div>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─── AIStatusKPI — statut IA en ligne (pastille verte/rouge + actifs/total) ───

function AIStatusKPI({ label, active, total }: { label: string; active: number; total: number }) {
  const online = active > 0
  return (
    <div className="relative flex flex-1 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Bot className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tracking-tight text-foreground">{active}/{total}</p>
      </div>
      {/* Pastille de statut (verte si au moins 1 agent actif, rouge sinon) */}
      <span className="relative flex h-3 w-3 shrink-0">
        {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
        <span className={cn('relative inline-flex h-3 w-3 rounded-full', online ? 'bg-emerald-500' : 'bg-red-500')} />
      </span>
    </div>
  )
}

// ─── Carte CTA contextuelle ──────────────────────────────────────────────────

function DashboardCTA({ connectedSessions, activeAgents, t }: {
  connectedSessions: number; activeAgents: number; t: (key: string) => string
}) {
  // Guide vers l'action manquante la plus prioritaire
  const cta = connectedSessions === 0
    ? { href: '/dashboard', title: t('dashboard.cta_connect_title'), desc: t('dashboard.cta_connect_desc'), btn: t('dashboard.cta_connect_btn'), icon: Smartphone }
    : activeAgents === 0
      ? { href: '/agents', title: t('dashboard.cta_agent_title'), desc: t('dashboard.cta_agent_desc'), btn: t('dashboard.cta_agent_btn'), icon: Bot }
      : { href: '/stats', title: t('dashboard.cta_explore_title'), desc: t('dashboard.cta_explore_desc'), btn: t('dashboard.cta_explore_btn'), icon: Sparkles }
  return (
    <div className="group/cta relative flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#8fd4b6] via-primary to-[#5fb592] p-6 shadow-[0_10px_30px_-8px_rgba(125,194,165,0.55)]">
      {/* Halo decoratif + leger motif */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '15px 15px' }}
        />
      </div>

      {/* Mascotte integree, ancree en bas a droite DANS la carte */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mascot-action.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-1 z-0 h-[78%] w-auto max-w-none object-contain object-bottom drop-shadow-[0_10px_16px_rgba(0,0,0,0.2)] transition-transform duration-500 ease-out group-hover/cta:-translate-y-1 group-hover/cta:rotate-2"
      />

      {/* Texte cale a gauche (largeur limitee pour cohabiter avec la mascotte) */}
      <div className="relative z-10 max-w-[60%] text-[#0d2a1f]">
        <h3 className="text-2xl font-extrabold leading-tight tracking-tight md:text-[28px]">{cta.title}</h3>
        <p className="mt-2.5 text-[15px] font-medium leading-snug text-[#0d2a1f]/75">{cta.desc}</p>
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
  // La checklist d'onboarding a été retirée : le dashboard affiche directement
  // les stats (la connexion WhatsApp/Email reste accessible en haut).
  return <StatsDashboard />
}

