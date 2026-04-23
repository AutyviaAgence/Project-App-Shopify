'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SubscriptionStatus, OnboardingStatus } from '@/types/database'
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
  tokensExtra: number
  tokensTotal: number
  tokensRemaining: number
  usagePercentage: number
  stripeSubscriptionId: string | null
  plan: PlanId
  pendingPlan: PlanId | null
  role: 'user' | 'admin'
  onboardingStatus: OnboardingStatus
  onboardingPlan: PlanId | null
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
        const tokensExtra = data.data.tokens_extra || 0
        const tokensTotal = tokensLimit + tokensExtra
        const tokensRemaining = Math.max(0, tokensTotal - tokensUsed)
        const usagePercentage = tokensTotal > 0 ? Math.round((tokensUsed / tokensTotal) * 100) : 100

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
          tokensExtra,
          tokensTotal,
          tokensRemaining,
          usagePercentage,
          stripeSubscriptionId: data.data.stripe_subscription_id || null,
          plan: (data.data.plan || 'scale') as PlanId,
          pendingPlan: (data.data.pending_plan || null) as PlanId | null,
          role: (data.data.role || 'user') as 'user' | 'admin',
          onboardingStatus: (data.data.onboarding_status || 'pending') as OnboardingStatus,
          onboardingPlan: (data.data.onboarding_plan || null) as PlanId | null,
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
