import Stripe from 'stripe'

// Prix de l'abonnement mensuel en centimes (150€)
export const SUBSCRIPTION_PRICE_CENTS = 15000
export const SUBSCRIPTION_PRICE_EUR = 150

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
