'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Check,
  X,
  CreditCard,
  Loader2,
  Calendar,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Cpu,
  Ban,
  Rocket,
  Phone,
  Crown,
  ArrowRight,
  ExternalLink,
  Workflow,
  Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import Link from 'next/link'
import type { PlanId } from '@/lib/stripe/plans'

const PLANS = [
  {
    id: 'starter' as PlanId,
    name: 'Starter',
    price: 39,
    tokens: '500 000',
    tokensDesc: '~400 conv/mois',
    icon: Zap,
    color: 'text-blue-500',
    borderColor: 'border-blue-500/30',
    bgGradient: 'from-blue-500/5',
    badgeBg: 'bg-blue-500/10 text-blue-600',
    buttonClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    features: [
      { text: '2 sessions WhatsApp', included: true },
      { text: '2 agents IA', included: true },
      { text: '5 docs RAG', included: true },
      { text: '3 liens WA', included: true },
      { text: '2 équipes', included: true },
      { text: 'Lifecycle (relances)', included: false },
      { text: 'Campagnes broadcast', included: false },
    ],
  },
  {
    id: 'pro' as PlanId,
    name: 'Pro',
    price: 79,
    tokens: '1 500 000',
    tokensDesc: '~1 200 conv/mois',
    icon: Rocket,
    color: 'text-primary',
    borderColor: 'border-primary/50',
    bgGradient: 'from-primary/5',
    badgeBg: 'bg-primary/10 text-primary',
    buttonClass: '',
    popular: true,
    features: [
      { text: '4 sessions WhatsApp', included: true },
      { text: '5 agents IA', included: true },
      { text: '10 docs RAG', included: true },
      { text: '8 liens WA', included: true },
      { text: '4 équipes', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Campagnes broadcast', included: false },
    ],
  },
  {
    id: 'scale' as PlanId,
    name: 'Scale',
    price: 150,
    tokens: '4 000 000',
    tokensDesc: '~3 200 conv/mois',
    icon: Crown,
    color: 'text-sky-500',
    borderColor: 'border-sky-500/30',
    bgGradient: 'from-sky-500/5',
    badgeBg: 'bg-sky-500/10 text-sky-600',
    buttonClass: 'bg-sky-500 hover:bg-sky-600 text-white',
    features: [
      { text: '10 sessions WhatsApp', included: true },
      { text: '10 agents IA', included: true },
      { text: '30 docs RAG', included: true },
      { text: '15 liens WA', included: true },
      { text: '10 équipes', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Campagnes broadcast', included: true },
    ],
  },
]

const ONBOARDING_STEPS = [
  { icon: CreditCard, label: 'Acompte 750€', status: 'done' },
  { icon: Settings2, label: 'Configurateur', status: 'current' },
  { icon: Settings2, label: 'Config & tests (J14–J30)', status: 'pending' },
  { icon: CreditCard, label: 'Solde 750€', status: 'pending' },
  { icon: Rocket, label: 'Accès complet', status: 'pending' },
]

function OnboardingSection({ onboardingStatus }: { onboardingStatus: 'pending' | 'onboarding' | 'active' }) {
  const [loadingAcompte, setLoadingAcompte] = useState(false)
  const { subscription } = useSubscription()

  const handleAcompte = async () => {
    setLoadingAcompte(true)
    try {
      const res = await fetch('/api/stripe/custom-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: subscription?.plan ?? 'scale' }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.error || 'Erreur')
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoadingAcompte(false)
    }
  }

  if (onboardingStatus === 'active') return null

  const stepStates =
    onboardingStatus === 'pending'
      ? ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']
      : ['done', 'current', 'upcoming', 'upcoming', 'upcoming']

  return (
    <Card className="mb-8 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <span className="font-semibold">Mise en place de votre plateforme</span>
          <Badge className={cn(
            onboardingStatus === 'pending' ? 'bg-amber-500' : 'bg-blue-500'
          )}>
            {onboardingStatus === 'pending' ? 'Non démarrée' : 'En cours'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Timeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {ONBOARDING_STEPS.map((step, i) => {
            const state = stepStates[i]
            return (
              <div key={i} className="flex items-center gap-1 shrink-0">
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2',
                  state === 'done' && 'border-green-500 bg-green-500 text-white',
                  state === 'current' && 'border-primary bg-primary text-white',
                  state === 'upcoming' && 'border-border bg-muted text-muted-foreground',
                )}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={cn(
                  'text-xs hidden sm:block',
                  state === 'done' && 'text-green-600',
                  state === 'current' && 'text-primary font-medium',
                  state === 'upcoming' && 'text-muted-foreground',
                )}>
                  {step.label}
                </span>
                {i < ONBOARDING_STEPS.length - 1 && (
                  <div className={cn('h-px w-4 mx-1', state === 'done' ? 'bg-green-400' : 'bg-border')} />
                )}
              </div>
            )
          })}
        </div>

        {onboardingStatus === 'pending' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <p className="text-sm text-muted-foreground flex-1">
              Démarrez la mise en place en réglant l&apos;acompte de <strong>750€</strong> (total : 1 500€ en 2×).
            </p>
            <Button onClick={handleAcompte} disabled={loadingAcompte} className="shrink-0">
              {loadingAcompte ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Payer l&apos;acompte 750€
            </Button>
          </div>
        )}

        {onboardingStatus === 'onboarding' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <p className="text-sm text-muted-foreground flex-1">
              Acompte reçu ✓ — Complétez le configurateur pour que notre équipe prépare votre plateforme.
            </p>
            <Link href="/onboarding/configurateur" className="shrink-0">
              <Button>
                <Settings2 className="mr-2 h-4 w-4" />
                Compléter le configurateur
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SubscriptionContent() {
  const { t, locale } = useTranslation()
  const tenant = useTenant()
  const searchParams = useSearchParams()
  const { subscription, loading, refetch } = useSubscription()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null)
  const [cgvAccepted, setCgvAccepted] = useState(false)

  useEffect(() => {
    const p = searchParams.get('plan')
    if (p === 'starter' || p === 'pro' || p === 'scale') {
      setSelectedPlan(p)
    }
  }, [searchParams])

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      fetch('/api/subscription/sync', { method: 'POST' })
        .then(() => refetch())
        .then(() => toast.success(t('subscription.payment_success')))
        .catch(() => refetch())
    } else if (searchParams.get('cancelled') === 'true') {
      toast.info(t('subscription.payment_cancelled'))
    } else if (searchParams.get('tokens_success') === 'true') {
      refetch().then(() => toast.success(t('subscription.tokens_added')))
    }
  }, [searchParams, refetch, t])

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId)
    setCgvAccepted(false)
  }

  const handleSubscribe = async () => {
    if (!selectedPlan || !cgvAccepted) return
    setIsProcessing(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('subscription.payment_error'))
      if (data.already_active) {
        toast.success(t('subscription.already_synced'))
        await refetch()
        setSelectedPlan(null)
        setIsProcessing(false)
        return
      }
      window.location.href = data.url
    } catch (error) {
      console.error('[Subscription] Error:', error)
      toast.error(t('subscription.payment_error'))
      setIsProcessing(false)
    }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      const res = await fetch('/api/stripe/cancel-subscription', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('subscription.cancel_success'))
      await refetch()
    } catch {
      toast.error(t('subscription.cancel_error'))
    } finally {
      setIsCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const formatDate = (date: Date | null) => {
    if (!date) return '-'
    return date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const isActive = subscription?.status === 'active' || subscription?.status === 'trial'
  const currentPlan = subscription?.plan ?? 'scale'
  const onboardingStatus = subscription?.onboardingStatus ?? 'pending'
  const planDetails = PLANS.find(p => p.id === selectedPlan)

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('subscription.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subscription.description', { appName: tenant.appName })}
        </p>
      </div>

      {/* Section onboarding (visible si pas encore active) */}
      <OnboardingSection onboardingStatus={onboardingStatus} />

      {/* Statut abonnement (visible uniquement si onboarding active) */}
      {onboardingStatus === 'active' && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{t('subscription.your_subscription')}</p>
                  {subscription?.status === 'trial' && subscription.trialEndsAt && (
                    <p className="text-sm text-muted-foreground">
                      {t('subscription.trial_ends')} {formatDate(subscription.trialEndsAt)}
                      {subscription.daysRemaining !== null && ` (${subscription.daysRemaining}j restants)`}
                    </p>
                  )}
                  {subscription?.status === 'active' && subscription.subscriptionEndsAt && (
                    <p className="text-sm text-muted-foreground">
                      {t('subscription.valid_until')} {formatDate(subscription.subscriptionEndsAt)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  className={cn(
                    subscription?.status === 'trial' && 'bg-amber-500 hover:bg-amber-600',
                    subscription?.status === 'active' && 'bg-green-500 hover:bg-green-600',
                    (subscription?.status === 'expired' || subscription?.status === 'cancelled') && 'bg-red-500 hover:bg-red-600',
                  )}
                >
                  {subscription?.status === 'trial' && `Essai — Plan ${PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}`}
                  {subscription?.status === 'active' && `Actif — Plan ${PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}`}
                  {subscription?.status === 'expired' && t('subscription.expired')}
                  {subscription?.status === 'cancelled' && t('subscription.cancelled')}
                </Badge>
                {isActive ? (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{t('subscription.access_active')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{t('subscription.access_expired')}</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Tokens */}
      {subscription && onboardingStatus === 'active' && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{t('subscription.token_usage')}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {subscription.tokensUsed.toLocaleString()} / {subscription.tokensLimit.toLocaleString()} tokens
              </span>
              <span className={cn(
                'font-medium',
                subscription.usagePercentage < 70 && 'text-green-600',
                subscription.usagePercentage >= 70 && subscription.usagePercentage < 90 && 'text-amber-600',
                subscription.usagePercentage >= 90 && 'text-red-600',
              )}>
                {subscription.usagePercentage}%
              </span>
            </div>
            <Progress
              value={Math.min(subscription.usagePercentage, 100)}
              className={cn(
                'h-3',
                subscription.usagePercentage >= 90 && '[&>div]:bg-red-500',
                subscription.usagePercentage >= 70 && subscription.usagePercentage < 90 && '[&>div]:bg-amber-500',
              )}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('subscription.tokens_remaining', { count: subscription.tokensRemaining.toLocaleString() })}
              </span>
              {subscription.usagePercentage >= 90 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/buy-tokens', { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      window.location.href = data.url
                    } catch {
                      toast.error(t('subscription.buy_tokens_error'))
                    }
                  }}
                >
                  <Zap className="mr-1 h-3 w-3" />
                  {t('subscription.buy_tokens')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions abonnement actif */}
      {isActive && onboardingStatus === 'active' && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/stripe/portal', { method: 'POST' })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
                    window.location.href = data.url
                  } catch {
                    toast.error('Impossible d\'ouvrir la gestion de l\'abonnement')
                  }
                }}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Gérer mon abonnement
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="text-destructive hover:text-destructive">
                    <Ban className="mr-2 h-4 w-4" />
                    {t('subscription.cancel_subscription')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('subscription.cancel_confirm_title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {subscription?.status === 'trial'
                        ? 'Votre essai gratuit sera annulé immédiatement. Vous ne serez jamais débité.'
                        : t('subscription.cancel_confirm_desc')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('subscription.cancel_keep')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                      {t('subscription.cancel_confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <h2 className="text-xl font-semibold mb-4">
        {isActive && onboardingStatus === 'active' ? 'Changer de plan' : 'Plans disponibles'}
      </h2>
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = isActive && onboardingStatus === 'active' && currentPlan === plan.id
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative border-2 bg-gradient-to-b to-transparent flex flex-col transition-shadow',
                plan.bgGradient,
                isCurrent ? 'border-green-500/60 shadow-md' : plan.borderColor,
                plan.popular && !isCurrent && 'shadow-sm',
              )}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white">
                    Plan actuel
                  </span>
                </div>
              )}
              {plan.popular && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Populaire
                  </span>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('h-5 w-5', plan.color)} />
                  <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', plan.badgeBg)}>
                    {plan.name}
                  </span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold">{plan.price}€</span>
                  <span className="text-muted-foreground mb-0.5 text-sm">/mois</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.tokens} tokens · {plan.tokensDesc}</p>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      {f.included
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                      <span className={f.included ? '' : 'text-muted-foreground/60'}>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Button className="w-full" disabled variant="outline">
                    <Check className="mr-2 h-4 w-4" />
                    Plan actuel
                  </Button>
                ) : onboardingStatus !== 'active' ? (
                  <Button className="w-full" disabled variant="outline" title="Finalisez la mise en place pour souscrire">
                    <Workflow className="mr-2 h-4 w-4" />
                    Mise en place requise
                  </Button>
                ) : (
                  <Button
                    className={cn('w-full', plan.buttonClass)}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    Choisir {plan.name}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Onboarding setup */}
      <Card className="border-sky-500/20 bg-gradient-to-r from-sky-500/5 to-transparent mb-6">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="font-semibold">Setup & accompagnement sur mesure</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configuration complète par notre équipe — <strong>1 500 €</strong> (2× 750 €)
              </p>
            </div>
            <a
              href="https://cal.com/autyvia/appel-decouverte"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-600 hover:bg-sky-500/10 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Réserver un appel découverte
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        <Clock className="inline-block h-4 w-4 mr-1" />
        {t('subscription.stripe_note')}
      </p>

      {/* Modale CGV */}
      <Dialog open={!!selectedPlan} onOpenChange={(open) => { if (!open) setSelectedPlan(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer votre abonnement</DialogTitle>
            <DialogDescription>
              Lisez et acceptez nos conditions avant de procéder au paiement.
            </DialogDescription>
          </DialogHeader>

          {planDetails && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Plan {planDetails.name}</span>
                <span className="font-bold">{planDetails.price}€/mois</span>
              </div>
              <p className="text-sm text-muted-foreground">{planDetails.tokens} tokens IA/mois</p>
              {!isActive && (
                <p className="text-xs text-muted-foreground mt-2">
                  14 jours d&apos;essai gratuit — vous ne serez prélevé qu&apos;à l&apos;issue de la période d&apos;essai.
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={cgvAccepted}
              onChange={e => setCgvAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
            />
            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              J&apos;ai lu et j&apos;accepte les{' '}
              <Link href="/cgv" target="_blank" className="text-primary underline hover:no-underline" onClick={e => e.stopPropagation()}>
                CGV
              </Link>{' '}
              et les{' '}
              <Link href="/cgu" target="_blank" className="text-primary underline hover:no-underline" onClick={e => e.stopPropagation()}>
                CGU
              </Link>
              .
            </span>
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setSelectedPlan(null)} disabled={isProcessing}>
              Annuler
            </Button>
            <Button onClick={handleSubscribe} disabled={!cgvAccepted || isProcessing}>
              {isProcessing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirection…</>
              ) : (
                'Continuer vers le paiement'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SubscriptionContent />
    </Suspense>
  )
}
