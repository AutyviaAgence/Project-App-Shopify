'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SubscriptionStatus } from '@/types/database'
import type { PlanId } from '@/lib/stripe/plans'

type SubscriptionInfo = {
  status: SubscriptionStatus
  trialEndsAt: Date | null
  subscriptionEndsAt: Date | null
  daysRemaining: number | null
  isActive: boolean
  isTrialExpired: boolean
  isSubscriptionExpired: boolean
  tokensUsed: number
  tokensLimit: number
  tokensRemaining: number
  usagePercentage: number
  stripeSubscriptionId: string | null
  plan: PlanId
  role: 'user' | 'admin'
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription')
      if (!res.ok) return

      const data = await res.json()
      if (data.data) {
        const trialEndsAt = data.data.trial_ends_at ? new Date(data.data.trial_ends_at) : null
        const subscriptionEndsAt = data.data.subscription_ends_at ? new Date(data.data.subscription_ends_at) : null
        const now = new Date()

        // Calculer les jours restants
        let daysRemaining: number | null = null
        if (data.data.subscription_status === 'trial' && trialEndsAt) {
          daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        } else if (data.data.subscription_status === 'active' && subscriptionEndsAt) {
          daysRemaining = Math.max(0, Math.ceil((subscriptionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        }

        const isTrialExpired = data.data.subscription_status === 'trial' && (!trialEndsAt || trialEndsAt < now)
        const isSubscriptionExpired = data.data.subscription_status === 'active' && subscriptionEndsAt && subscriptionEndsAt < now
        const isActive =
          (data.data.subscription_status === 'trial' && trialEndsAt && trialEndsAt > now) ||
          (data.data.subscription_status === 'active' && (!subscriptionEndsAt || subscriptionEndsAt > now))

        // Token usage
        const tokensUsed = data.data.tokens_used || 0
        const tokensLimit = data.data.tokens_limit || 0
        const tokensRemaining = Math.max(0, tokensLimit - tokensUsed)
        const usagePercentage = tokensLimit > 0 ? Math.round((tokensUsed / tokensLimit) * 100) : 100

        setSubscription({
          status: data.data.subscription_status,
          trialEndsAt,
          subscriptionEndsAt,
          daysRemaining,
          isActive: isActive || false,
          isTrialExpired: isTrialExpired || false,
          isSubscriptionExpired: isSubscriptionExpired || false,
          tokensUsed,
          tokensLimit,
          tokensRemaining,
          usagePercentage,
          stripeSubscriptionId: data.data.stripe_subscription_id || null,
          plan: (data.data.plan || 'scale') as PlanId,
          role: (data.data.role || 'user') as 'user' | 'admin',
        })
      }
    } catch (error) {
      console.error('[Subscription] Error fetching:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  return { subscription, loading, refetch: fetchSubscription }
}
