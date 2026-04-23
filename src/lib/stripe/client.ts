import Stripe from 'stripe'

// Prix de l'abonnement mensuel en centimes (150€) — conservé pour compatibilité
export const SUBSCRIPTION_PRICE_CENTS = 15000
export const SUBSCRIPTION_PRICE_EUR = 150

// Prix du setup Custom en 2x (750€ x 2)
export const CUSTOM_SETUP_INSTALLMENT_CENTS = 75000
export const CUSTOM_SETUP_TOTAL_EUR = 1500
export const CUSTOM_BOOKING_URL = 'https://cal.com/autyvia/appel-on-boarding'
export const DISCOVERY_CALL_URL = 'https://cal.com/autyvia/appel-decouverte'

// Plans tarifaires
export type PlanId = 'starter' | 'pro' | 'scale'

export const PLAN_PRICES_EUR: Record<PlanId, number> = {
  starter: 39,
  pro: 79,
  scale: 150,
}

export const PLAN_TOKEN_LIMITS: Record<PlanId, number> = {
  starter: 500_000,
  pro: 1_500_000,
  scale: 4_000_000,
}

export const PLAN_PRICE_IDS: Record<PlanId, string> = {
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
