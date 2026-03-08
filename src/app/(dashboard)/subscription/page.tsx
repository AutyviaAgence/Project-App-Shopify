'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
  Check,
  CreditCard,
  Loader2,
  Calendar,
  Zap,
  MessageSquare,
  Bot,
  Users,
  BarChart,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Cpu,
  Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import type { LucideIcon } from 'lucide-react'

const FEATURES: { icon: LucideIcon; textKey: string }[] = [
  { icon: MessageSquare, textKey: 'subscription.feature_conversations' },
  { icon: Bot, textKey: 'subscription.feature_agents' },
  { icon: Users, textKey: 'subscription.feature_teams' },
  { icon: BarChart, textKey: 'subscription.feature_stats' },
  { icon: Zap, textKey: 'subscription.feature_automation' },
  { icon: Shield, textKey: 'subscription.feature_encryption' },
]

function SubscriptionContent() {
  const { t, locale } = useTranslation()
  const tenant = useTenant()
  const searchParams = useSearchParams()
  const { subscription, loading, refetch } = useSubscription()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  // Gérer les redirections depuis Stripe
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      // Synchroniser l'abonnement depuis Stripe (fallback si le webhook n'a pas fonctionné)
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

  const handleSubscribe = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t('subscription.payment_error'))
      }

      // Si l'abonnement est déjà actif côté Stripe, rafraîchir
      if (data.already_active) {
        toast.success(t('subscription.already_synced'))
        await refetch()
        setIsProcessing(false)
        return
      }

      // Rediriger vers Stripe Checkout
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
    return date.toLocaleDateString(dateLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('subscription.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subscription.description', { appName: tenant.appName })}
        </p>
      </div>

      {/* Statut actuel */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('subscription.your_subscription')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('subscription.status_label')}</span>
                <Badge
                  variant={subscription?.isActive ? 'default' : 'destructive'}
                  className={cn(
                    subscription?.status === 'trial' && 'bg-amber-500 hover:bg-amber-600',
                    subscription?.status === 'active' && 'bg-green-500 hover:bg-green-600'
                  )}
                >
                  {subscription?.status === 'trial' && t('subscription.trial')}
                  {subscription?.status === 'active' && t('subscription.active')}
                  {subscription?.status === 'expired' && t('subscription.expired')}
                  {subscription?.status === 'cancelled' && t('subscription.cancelled')}
                </Badge>
              </div>

              {subscription?.status === 'trial' && subscription.trialEndsAt && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('subscription.trial_ends')}</span>{' '}
                  <span className="font-medium">{formatDate(subscription.trialEndsAt)}</span>
                  {subscription.daysRemaining !== null && (
                    <span className="text-muted-foreground"> ({t('subscription.days_remaining', { count: String(subscription.daysRemaining) })})</span>
                  )}
                </p>
              )}

              {subscription?.status === 'active' && subscription.subscriptionEndsAt && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('subscription.valid_until')}</span>{' '}
                  <span className="font-medium">{formatDate(subscription.subscriptionEndsAt)}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {subscription?.isActive ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">{t('subscription.access_active')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">{t('subscription.access_expired')}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Utilisation des tokens IA */}
      {subscription && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              {t('subscription.token_usage')}
            </CardTitle>
            <CardDescription>
              {subscription.status === 'trial'
                ? t('subscription.trial_tokens')
                : subscription.status === 'active'
                  ? t('subscription.active_tokens')
                  : t('subscription.no_quota')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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
            </div>

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

      {/* Offre d'abonnement */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t('subscription.offer_title', { appName: tenant.appName })}</CardTitle>
          <CardDescription>
            {t('subscription.offer_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="mb-6">
            <span className="text-5xl font-bold">{t('subscription.price')}</span>
            <span className="text-muted-foreground">{t('subscription.per_month')}</span>
          </div>

          <div className="grid gap-3 text-left mb-6">
            {FEATURES.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm">{t(feature.textKey)}</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          {subscription?.status === 'active' ? (
            <>
              <Button className="w-full" size="lg" disabled>
                <Check className="mr-2 h-5 w-5" />
                {t('subscription.already_active')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Ban className="mr-2 h-4 w-4" />
                    {t('subscription.cancel_subscription')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('subscription.cancel_confirm_title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('subscription.cancel_confirm_desc')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('subscription.cancel_keep')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isCancelling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="mr-2 h-4 w-4" />
                      )}
                      {t('subscription.cancel_confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubscribe}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t('subscription.redirecting')}
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-5 w-5" />
                  {t('subscription.subscribe_now')}
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Note */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Clock className="inline-block h-4 w-4 mr-1" />
        {t('subscription.stripe_note')}
      </p>
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
