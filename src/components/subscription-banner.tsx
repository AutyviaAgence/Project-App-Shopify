'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, CreditCard, Cpu } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

type SubscriptionInfo = {
  status: string
  isActive: boolean
  isTrialExpired: boolean
  isSubscriptionExpired: boolean
  daysRemaining: number | null
  usagePercentage: number
  tokensRemaining: number
}

export function SubscriptionBanner({ subscription }: { subscription: SubscriptionInfo | null }) {
  const { t } = useTranslation()
  const tenant = useTenant()

  if (!subscription) return null

  // Token limit reached (100%) — red banner
  if (subscription.isActive && subscription.usagePercentage >= 100) {
    return (
      <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t('banner.tokens_exhausted')}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700">
              {t('banner.buy_tokens')}
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
              {t('banner.tokens_warning', { percent: String(subscription.usagePercentage), remaining: subscription.tokensRemaining.toLocaleString() })}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10">
              {t('banner.view_usage')}
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
              {t('banner.trial_remaining', { days: String(subscription.daysRemaining) })}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10">
              <CreditCard className="mr-1.5 h-3 w-3" />
              {t('banner.subscribe')}
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
                ? t('banner.trial_ended', { appName: tenant.appName })
                : t('banner.subscription_expired', { appName: tenant.appName })}
            </span>
          </div>
          <Link href="/subscription">
            <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
              {t('banner.subscribe_now')}
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return null
}
