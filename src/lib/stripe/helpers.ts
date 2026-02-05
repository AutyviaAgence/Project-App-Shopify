import type Stripe from 'stripe'

/**
 * Extraire la date de fin de période d'un abonnement Stripe.
 * Gère les différentes versions de l'API Stripe.
 */
export function getSubscriptionEndDate(subscription: Stripe.Subscription): Date {
  // Essayer current_period_end (timestamp en secondes)
  const raw = (subscription as any).current_period_end
  if (typeof raw === 'number' && raw > 0) {
    return new Date(raw * 1000)
  }

  // Essayer via les items
  const item = subscription.items?.data?.[0]
  if (item) {
    const itemEnd = (item as any).current_period_end
    if (typeof itemEnd === 'number' && itemEnd > 0) {
      return new Date(itemEnd * 1000)
    }
  }

  // Fallback: +1 mois à partir de maintenant
  const fallback = new Date()
  fallback.setMonth(fallback.getMonth() + 1)
  return fallback
}
