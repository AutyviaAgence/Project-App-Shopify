'use client'

import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function SubscriptionBanner() {
  const { subscription, loading } = useSubscription()

  if (loading || !subscription) return null

  // Abonnement actif sans problème
  if (subscription.isActive && subscription.status === 'active') return null

  // Période d'essai avec plus de 3 jours restants
  if (subscription.status === 'trial' && subscription.daysRemaining && subscription.daysRemaining > 3) {
    return null
  }

  // Période d'essai avec 3 jours ou moins
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

  // Période d'essai expirée ou abonnement expiré
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
