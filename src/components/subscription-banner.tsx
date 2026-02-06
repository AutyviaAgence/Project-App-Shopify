'use client'

import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, CreditCard, Cpu } from 'lucide-react'
import Link from 'next/link'

export function SubscriptionBanner() {
  const { subscription, loading } = useSubscription()

  if (loading || !subscription) return null

  // Token limit reached (100%) — red banner
  if (subscription.isActive && subscription.usagePercentage >= 100) {
    return (
      <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">
              Limite de tokens IA atteinte — l&apos;IA est suspendue.
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700">
              Acheter des tokens
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Token usage high (>=90%) — amber banner
  if (subscription.isActive && subscription.usagePercentage >= 90) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">
              {subscription.usagePercentage}% des tokens IA utilisés — {subscription.tokensRemaining.toLocaleString()} restants
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10">
              Voir mon utilisation
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Active subscription without issues
  if (subscription.isActive && subscription.status === 'active') return null

  // Trial with more than 3 days remaining
  if (subscription.status === 'trial' && subscription.daysRemaining && subscription.daysRemaining > 3) {
    return null
  }

  // Trial with 3 days or less
  if (subscription.status === 'trial' && subscription.daysRemaining !== null && subscription.daysRemaining > 0) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              Période d&apos;essai : {subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10">
              <CreditCard className="mr-1.5 h-3 w-3" />
              S&apos;abonner
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Trial expired or subscription expired
  if (subscription.isTrialExpired || subscription.isSubscriptionExpired || subscription.status === 'expired') {
    return (
      <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              {subscription.isTrialExpired
                ? 'Votre période d\'essai est terminée. Abonnez-vous pour continuer à utiliser Autyvia.'
                : 'Votre abonnement a expiré. Renouvelez pour continuer à utiliser Autyvia.'}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
              S&apos;abonner maintenant
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return null
}
