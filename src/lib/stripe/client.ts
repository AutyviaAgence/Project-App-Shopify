import Stripe from 'stripe'
export type { PlanId, PaidPlanId } from './plans'
export { PLAN_PRICES_EUR, PLAN_TOKEN_LIMITS, VALID_PLANS, resolvePlan } from './plans'

// Prix de l'abonnement mensuel en centimes (150€) — conservé pour compatibilité
export const SUBSCRIPTION_PRICE_CENTS = 15000
export const SUBSCRIPTION_PRICE_EUR = 150

// Prix du setup Custom en 2x (445€ x 2)
export const CUSTOM_SETUP_INSTALLMENT_CENTS = 44500
export const CUSTOM_SETUP_TOTAL_EUR = 990
export const CUSTOM_BOOKING_URL = 'https://cal.com/autyvia/appel-on-boarding'
export const DISCOVERY_CALL_URL = 'https://cal.com/autyvia/appel-decouverte'

import type { PaidPlanId } from './plans'
// Seuls les plans payants ont un Price Stripe (free = pas de checkout).
export const PLAN_PRICE_IDS: Record<PaidPlanId, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID!,
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  scale: process.env.STRIPE_SCALE_PRICE_ID!,
}

// Créer le client Stripe seulement si la clé est configurée
function createStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set. Please configure it in your .env.local file.')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

// Export lazy - le client sera créé à la première utilisation
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = createStripeClient()
  }
  return _stripe
}
