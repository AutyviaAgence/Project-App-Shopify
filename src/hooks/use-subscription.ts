'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SubscriptionStatus, AuditStatus } from '@/types/database'
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
  stripeCustomerId: string | null
  plan: PlanId | null
  pendingPlan: PlanId | null
  role: 'user' | 'admin'
  auditStatus: AuditStatus
  onboardingPlan: PlanId | null
  configurateurSubmitted: boolean
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
        if (data.data.subscription_status === 'trialing' && trialEndsAt) {
          daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        } else if (data.data.subscription_status === 'active' && subscriptionEndsAt) {
          daysRemaining = Math.max(0, Math.ceil((subscriptionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        }

        const isTrialExpired = data.data.subscription_status === 'trialing' && (!trialEndsAt || trialEndsAt < now)
        const isSubscriptionExpired = data.data.subscription_status === 'active' && subscriptionEndsAt && subscriptionEndsAt < now
        const isActive =
          (data.data.subscription_status === 'trialing' && trialEndsAt && trialEndsAt > now) ||
          (data.data.subscription_status === 'active' && (!subscriptionEndsAt || subscriptionEndsAt > now)) ||
          // Annulé mais période encore en cours → accès maintenu jusqu'à la fin
          (data.data.subscription_status === 'canceled' && subscriptionEndsAt && subscriptionEndsAt > now)

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
          stripeCustomerId: data.data.stripe_customer_id || null,
          plan: (data.data.plan || null) as PlanId | null,
          pendingPlan: (data.data.pending_plan || null) as PlanId | null,
          role: (data.data.role || 'user') as 'user' | 'admin',
          auditStatus: (data.data.audit_status || 'none') as AuditStatus,
          onboardingPlan: (data.data.onboarding_plan || null) as PlanId | null,
          configurateurSubmitted: data.data.configurateur_submitted === true,
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
