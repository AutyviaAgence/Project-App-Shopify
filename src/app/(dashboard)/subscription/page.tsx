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

function OnboardingSection({ onboardingStatus, onboardingPlan }: { onboardingStatus: 'pending' | 'onboarding' | 'active'; onboardingPlan: string | null }) {
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
          <div className="space-y-3 pt-1">
            <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>J0 — Acompte setup</span><span className="font-semibold text-foreground">750€</span></div>
              <div className="flex justify-between text-muted-foreground/60"><span>J30 — Solde setup</span><span>750€</span></div>
              <div className="flex justify-between text-muted-foreground/60"><span>J30 — 1er mois abonnement</span><span>selon plan</span></div>
              <p className="pt-1 text-muted-foreground/70">L&apos;abonnement mensuel démarre en même temps que le solde à J+30.</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAcompte} disabled={loadingAcompte}>
                {loadingAcompte ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Payer l&apos;acompte 750€
              </Button>
            </div>
          </div>
        )}

        {onboardingStatus === 'onboarding' && (
          <div className="space-y-3 pt-1">
            {onboardingPlan && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                {(() => {
                  const p = PLANS.find(p => p.id === onboardingPlan)
                  const Icon = p?.icon
                  return (
                    <>
                      {Icon && <Icon className={cn('h-4 w-4 shrink-0', p?.color)} />}
                      <span className="text-sm font-semibold">Plan sélectionné : {p?.name ?? onboardingPlan}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p?.price}€/mois</span>
                    </>
                  )
                })()}
              </div>
            )}
            <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between text-green-600"><span>✓ Acompte setup reçu</span><span className="font-semibold">750€</span></div>
              <div className="flex justify-between text-muted-foreground/60"><span>J30 — Solde setup + 1er mois abonnement</span><span>750€ + {onboardingPlan ? `${PLANS.find(p => p.id === onboardingPlan)?.price ?? '?'}€` : 'selon plan'}/mois</span></div>
            </div>
            <div className="flex justify-end">
              <Link href="/onboarding/configurateur">
                <Button>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Compléter le configurateur
                </Button>
              </Link>
            </div>
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
      // Si abonnement actif → changement de plan immédiat (prorata)
      if (isActive && !isCancelled && subscription?.stripeSubscriptionId) {
        const res = await fetch('/api/stripe/change-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: selectedPlan }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur lors du changement de plan')
        toast.success(`Plan changé vers ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} avec succès`)
        await refetch()
        setSelectedPlan(null)
        setIsProcessing(false)
        return
      }

      // Sinon → nouveau checkout Stripe
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
      toast.error(error instanceof Error ? error.message : t('subscription.payment_error'))
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
  const isCancelled = subscription?.status === 'cancelled'
  const currentPlan = subscription?.plan ?? 'scale'
  // For cancelled subscriptions, ignore pending_plan — user needs to re-subscribe fresh
  const pendingPlan = !isCancelled ? (subscription?.pendingPlan ?? null) : null
  const onboardingStatus = subscription?.onboardingStatus ?? 'pending'
  const onboardingPlan = subscription?.onboardingPlan ?? null
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
      <OnboardingSection onboardingStatus={onboardingStatus} onboardingPlan={onboardingPlan} />

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

      {/* Bandeau changement de plan planifié */}
      {pendingPlan && isActive && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">Changement planifié — </span>
            <span className="text-muted-foreground">
              Votre plan passera au{' '}
              <span className="font-semibold text-foreground">{PLANS.find(p => p.id === pendingPlan)?.name ?? pendingPlan}</span>
              {subscription?.subscriptionEndsAt && (
                <> le {subscription.subscriptionEndsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>
              )}
              . Votre plan actuel reste actif jusqu&apos;à cette date.
            </span>
          </div>
        </div>
      )}

      {/* Tokens — visible pour onboarding et active */}
      {subscription && (onboardingStatus === 'active' || onboardingStatus === 'onboarding') && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">{t('subscription.token_usage')}</span>
              </div>
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
                Acheter +500k tokens (50€)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Barre globale */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {subscription.tokensUsed.toLocaleString()} / {subscription.tokensTotal.toLocaleString()} tokens utilisés
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
                  'h-2.5',
                  subscription.usagePercentage >= 90 && '[&>div]:bg-red-500',
                  subscription.usagePercentage >= 70 && subscription.usagePercentage < 90 && '[&>div]:bg-amber-500',
                )}
              />
              <p className="text-xs text-muted-foreground">
                {subscription.tokensRemaining.toLocaleString()} tokens restants
              </p>
            </div>

            {/* Détail : plan + extra */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">Tokens du plan</p>
                <p className="text-sm font-semibold">{subscription.tokensLimit.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground/70">Remis à zéro chaque mois</p>
              </div>
              <div className={cn(
                'rounded-lg border p-3 space-y-0.5',
                subscription.tokensExtra > 0 ? 'bg-primary/5 border-primary/20' : 'bg-muted/30',
              )}>
                <p className="text-xs text-muted-foreground">Tokens supplémentaires</p>
                <p className={cn('text-sm font-semibold', subscription.tokensExtra > 0 && 'text-primary')}>
                  {subscription.tokensExtra.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground/70">Permanent jusqu&apos;à épuisement</p>
              </div>
            </div>

            {subscription.usagePercentage >= 80 && (
              <div className={cn(
                'rounded-lg p-3 text-xs',
                subscription.usagePercentage >= 100 ? 'bg-red-500/10 text-red-700 border border-red-500/20' :
                subscription.usagePercentage >= 90 ? 'bg-orange-500/10 text-orange-700 border border-orange-500/20' :
                'bg-amber-500/10 text-amber-700 border border-amber-500/20',
              )}>
                {subscription.usagePercentage >= 100
                  ? "Limite atteinte — l'IA est suspendue. Achetez des tokens pour continuer."
                  : subscription.usagePercentage >= 90
                  ? "Vous approchez de la limite. Rechargez maintenant pour éviter une interruption."
                  : "Vous avez consommé plus de 80% de vos tokens. Pensez à recharger bientôt."}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions abonnement actif */}
      {isActive && (onboardingStatus === 'active' || onboardingStatus === 'onboarding') && (
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
        {isCancelled ? 'Se réabonner' : isActive && onboardingStatus === 'active' ? 'Changer de plan' : 'Plans disponibles'}
      </h2>
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = isActive && onboardingStatus === 'active' && currentPlan === plan.id && !pendingPlan
          const isPending = pendingPlan === plan.id
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative border-2 bg-gradient-to-b to-transparent flex flex-col transition-shadow',
                plan.bgGradient,
                isCurrent ? 'border-green-500/60 shadow-md' : isPending ? 'border-amber-500/60 shadow-md' : plan.borderColor,
                plan.popular && !isCurrent && !isPending && 'shadow-sm',
              )}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white">
                    Plan actuel
                  </span>
                </div>
              )}
              {isPending && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                    Prochain plan
                  </span>
                </div>
              )}
              {plan.popular && !isCurrent && !isPending && (
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
                ) : isPending ? (
                  <Button className="w-full" disabled variant="outline">
                    <Clock className="mr-2 h-4 w-4 text-amber-500" />
                    Prochain renouvellement
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

      {/* Modale confirmation plan */}
      <Dialog open={!!selectedPlan} onOpenChange={(open) => { if (!open) setSelectedPlan(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isActive && !isCancelled && subscription?.stripeSubscriptionId ? 'Changer de plan' : isCancelled ? 'Se réabonner' : 'Confirmer votre abonnement'}
            </DialogTitle>
            <DialogDescription>
              {isActive && !isCancelled && subscription?.stripeSubscriptionId
                ? `Le changement prendra effet à votre prochain renouvellement${subscription?.subscriptionEndsAt ? ` le ${subscription.subscriptionEndsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Votre plan actuel reste actif jusqu\'à cette date.`
                : isCancelled
                ? 'Votre abonnement a été annulé. Choisissez un plan pour vous réabonner.'
                : 'Lisez et acceptez nos conditions avant de procéder au paiement.'}
            </DialogDescription>
          </DialogHeader>

          {planDetails && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              {isActive && !isCancelled && subscription?.stripeSubscriptionId && currentPlan && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <span>{PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{planDetails.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-semibold">Plan {planDetails.name}</span>
                <span className="font-bold">{planDetails.price}€/mois</span>
              </div>
              <p className="text-sm text-muted-foreground">{planDetails.tokens} tokens IA/mois</p>
              {!isActive && !isCancelled && (
                <p className="text-xs text-muted-foreground mt-1">
                  14 jours d&apos;essai gratuit — vous ne serez prélevé qu&apos;à l&apos;issue de la période d&apos;essai.
                </p>
              )}
              {isActive && !isCancelled && subscription?.stripeSubscriptionId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Vos tokens actuels restent disponibles jusqu&apos;au renouvellement, puis remis à zéro avec la limite du nouveau plan.
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isActive && !isCancelled && subscription?.stripeSubscriptionId ? 'Changement…' : 'Redirection…'}</>
              ) : (
                isActive && !isCancelled && subscription?.stripeSubscriptionId ? 'Confirmer le changement' : isCancelled ? 'Se réabonner' : 'Continuer vers le paiement'
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
