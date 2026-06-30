'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'
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
  Crown,
  ArrowRight,
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
    price: 29,
    tokens: '500 000',
    tokensDesc: '~400 conv/mois',
    icon: Zap,
    color: 'text-blue-500',
    borderColor: 'border-blue-500/30',
    bgGradient: 'from-blue-500/5',
    badgeBg: 'bg-blue-500/10 text-blue-600',
    buttonClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    features: [
      { text: '1 numéro WhatsApp', included: true },
      { text: '2 agents IA', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Actions Shopify', included: true },
      { text: 'Lifecycle (relances)', included: false },
      { text: 'Campagnes', included: false },
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
      { text: '1 numéro WhatsApp', included: true },
      { text: '5 agents IA', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Actions Shopify', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Campagnes', included: true },
    ],
  },
  {
    id: 'scale' as PlanId,
    name: 'Scale',
    price: 149,
    tokens: '4 000 000',
    tokensDesc: '~3 200 conv/mois',
    icon: Crown,
    color: 'text-sky-500',
    borderColor: 'border-sky-500/30',
    bgGradient: 'from-sky-500/5',
    badgeBg: 'bg-sky-500/10 text-sky-600',
    buttonClass: 'bg-sky-500 hover:bg-sky-600 text-white',
    features: [
      { text: 'Numéros WhatsApp illimités', included: true },
      { text: 'Agents IA illimités', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Actions Shopify avancées', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Support prioritaire', included: true },
    ],
  },
]

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
      track('subscription_started')
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

      // Lire le code affilié depuis le cookie si présent
      const affiliateCode = document.cookie
        .split('; ')
        .find(r => r.startsWith('affiliate_code='))
        ?.split('=')[1] || undefined

      // Sinon → nouveau checkout Stripe
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, ...(affiliateCode ? { affiliate_code: affiliateCode } : {}) }),
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

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'
  const isCancelled = subscription?.status === 'canceled'
  const currentPlan = subscription?.plan ?? null
  // For cancelled subscriptions, ignore pending_plan — user needs to re-subscribe fresh
  const pendingPlan = !isCancelled ? (subscription?.pendingPlan ?? null) : null
  const planDetails = PLANS.find(p => p.id === selectedPlan)

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('subscription.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subscription.description', { appName: tenant.appName })}
        </p>
      </div>

      {/* Statut abonnement */}
      {subscription && (
        <Card className={cn(
          'mb-8 border-2',
          subscription.status === 'active' && 'border-green-500/30',
          subscription.status === 'trialing' && 'border-amber-500/30',
          subscription.status === 'canceled' && 'border-orange-500/30',
          subscription.status === 'past_due' && 'border-red-500/30',
        )}>
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-5">

              {/* Ligne 1 : plan + badge statut */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const planInfo = PLANS.find(p => p.id === currentPlan)
                    const Icon = planInfo?.icon ?? Cpu
                    return <Icon className={cn('h-6 w-6', planInfo?.color ?? 'text-muted-foreground')} />
                  })()}
                  <div>
                    <p className="text-lg font-bold">
                      Plan {PLANS.find(p => p.id === currentPlan)?.name ?? 'Aucun plan'}
                      {pendingPlan && (
                        <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                          → {PLANS.find(p => p.id === pendingPlan)?.name ?? pendingPlan} au prochain renouvellement
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {PLANS.find(p => p.id === currentPlan)?.price ?? '—'}€/mois
                      {pendingPlan && (
                        <span className="ml-1">
                          → {PLANS.find(p => p.id === pendingPlan)?.price ?? '—'}€/mois après renouvellement
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Badge className={cn(
                  'text-sm px-3 py-1 self-start sm:self-auto',
                  subscription.status === 'active' && 'bg-green-500 hover:bg-green-600',
                  subscription.status === 'trialing' && 'bg-amber-500 hover:bg-amber-600',
                  subscription.status === 'canceled' && 'bg-orange-500 hover:bg-orange-600',
                  subscription.status === 'past_due' && 'bg-red-500 hover:bg-red-600',
                )}>
                  {subscription.status === 'active' && 'Actif'}
                  {subscription.status === 'trialing' && 'Période d\'essai'}
                  {subscription.status === 'canceled' && 'Annulé'}
                  {subscription.status === 'past_due' && 'Expiré'}
                </Badge>
              </div>

              {/* Ligne 2 : infos clés */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Prochain prélèvement / fin de période */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {subscription.status === 'canceled'
                      ? 'Accès jusqu\'au'
                      : subscription.status === 'trialing'
                      ? 'Fin d\'essai'
                      : 'Prochain renouvellement'}
                  </p>
                  <p className="text-sm font-semibold">
                    {subscription.status === 'active' && subscription.subscriptionEndsAt
                      ? formatDate(subscription.subscriptionEndsAt)
                      : subscription.status === 'trialing' && subscription.trialEndsAt
                      ? formatDate(subscription.trialEndsAt)
                      : subscription.status === 'canceled' && subscription.subscriptionEndsAt
                      ? formatDate(subscription.subscriptionEndsAt)
                      : '—'}
                  </p>
                  {subscription.daysRemaining !== null && subscription.daysRemaining > 0 && (
                    <p className="text-xs text-muted-foreground/70">{subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''}</p>
                  )}
                </div>

                {/* Montant prochain prélèvement */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {subscription.status === 'canceled' || subscription.status === 'past_due'
                      ? 'Prochain paiement'
                      : 'Montant prélevé'}
                  </p>
                  <p className="text-sm font-semibold">
                    {subscription.status === 'canceled' || subscription.status === 'past_due'
                      ? '—'
                      : pendingPlan
                      ? `${PLANS.find(p => p.id === pendingPlan)?.price ?? '—'}€`
                      : `${PLANS.find(p => p.id === currentPlan)?.price ?? '—'}€`}
                  </p>
                  {(subscription.status === 'active' || subscription.status === 'trialing') && !pendingPlan && (
                    <p className="text-xs text-muted-foreground/70">par mois, hors taxes</p>
                  )}
                  {pendingPlan && subscription.status !== 'canceled' && subscription.status !== 'past_due' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">nouveau montant</p>
                  )}
                  {(subscription.status === 'canceled' || subscription.status === 'past_due') && (
                    <p className="text-xs text-muted-foreground/70">aucun renouvellement</p>
                  )}
                </div>

                {/* Accès */}
                <div className={cn(
                  'rounded-lg border p-3 space-y-0.5 col-span-2 sm:col-span-1',
                  subscription.isActive ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20',
                )}>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {subscription.isActive
                      ? <CheckCircle className="h-3 w-3 text-green-500" />
                      : <XCircle className="h-3 w-3 text-red-500" />}
                    Accès plateforme
                  </p>
                  <p className={cn('text-sm font-semibold', subscription.isActive ? 'text-green-600' : 'text-red-600')}>
                    {subscription.isActive ? 'Actif' : 'Suspendu'}
                  </p>
                  {subscription.status === 'canceled' && subscription.isActive && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">jusqu&apos;à fin de période</p>
                  )}
                  {!subscription.isActive && (
                    <p className="text-xs text-red-500/70">Réabonnez-vous pour accéder</p>
                  )}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      )}


      {/* Tokens — visible pour onboarding, active et skipped */}
      {subscription && (!!currentPlan) && (
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
      {isActive && (!!currentPlan) && (
        <Card className="mb-8">
          <CardContent className="pt-6 space-y-4">
            {/* Portail Stripe — uniquement si un customer Stripe existe */}
            {subscription?.stripeCustomerId ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Portail de facturation</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gérez vos moyens de paiement, téléchargez vos factures et modifiez vos informations de facturation.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0"
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
                </div>
                <div className="border-t" />
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Abonnement mensuel requis</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Votre accès a été activé manuellement. Pour continuer après la période en cours, souscrivez à un abonnement mensuel ci-dessous.
                </p>
              </div>
            )}

            {/* Résiliation — uniquement si un abonnement Stripe existe */}
            {subscription?.stripeCustomerId && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Zone de danger</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {subscription?.status === 'trialing'
                      ? 'L\'annulation est immédiate. Vous ne serez pas débité.'
                      : 'L\'accès reste actif jusqu\'à la fin de la période en cours. Aucun remboursement au prorata.'}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive">
                      <Ban className="mr-2 h-4 w-4" />
                      {t('subscription.cancel_subscription')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('subscription.cancel_confirm_title')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {subscription?.status === 'trialing'
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <h2 className="text-xl font-semibold mb-4">
        {isCancelled
          ? 'Se réabonner'
          : isActive && (!!currentPlan) && !subscription?.stripeCustomerId
          ? 'Souscrire un abonnement mensuel'
          : isActive && (!!currentPlan)
          ? 'Changer de plan'
          : 'Plans disponibles'}
      </h2>
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = isActive && (!!currentPlan) && currentPlan === plan.id && !pendingPlan
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
