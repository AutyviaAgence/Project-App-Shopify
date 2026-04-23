/**
 * Script one-shot : crée le produit Autyvia + 3 prix Stripe et met à jour .env.local
 * Usage : node scripts/create-stripe-prices.mjs
 */

import Stripe from 'stripe'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '../.env.local')

// Lire la clé depuis .env.local
const envContent = fs.readFileSync(ENV_PATH, 'utf-8')
const stripeKeyMatch = envContent.match(/^STRIPE_SECRET_KEY=(.+)$/m)
if (!stripeKeyMatch) {
  console.error('❌ STRIPE_SECRET_KEY introuvable dans .env.local')
  process.exit(1)
}
const stripeKey = stripeKeyMatch[1].trim()
const isTest = stripeKey.startsWith('sk_test_')
console.log(`\n🔑 Mode Stripe : ${isTest ? 'TEST' : 'PRODUCTION'}`)

const stripe = new Stripe(stripeKey)

const PLANS = [
  { key: 'STARTER', name: 'Starter', amount: 3900, tokens: '500 000' },
  { key: 'PRO',     name: 'Pro',     amount: 7900, tokens: '1 500 000' },
  { key: 'SCALE',   name: 'Scale',   amount: 15000, tokens: '4 000 000' },
]

async function run() {
  console.log('\n📦 Recherche du produit existant "Abonnement Autyvia"...')

  // Chercher si le produit existe déjà
  const existingProducts = await stripe.products.list({ limit: 100, active: true })
  let product = existingProducts.data.find(p => p.name === 'Abonnement Autyvia')

  if (product) {
    console.log(`✅ Produit existant trouvé : ${product.id}`)
  } else {
    product = await stripe.products.create({
      name: 'Abonnement Autyvia',
      description: 'Plateforme d\'automatisation WhatsApp IA',
    })
    console.log(`✅ Produit créé : ${product.id}`)
  }

  const createdPrices = {}

  for (const plan of PLANS) {
    const envKey = `STRIPE_${plan.key}_PRICE_ID`

    // Vérifier si un prix existe déjà pour ce plan (via metadata)
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    })
    const existing = existingPrices.data.find(
      p => p.metadata?.plan === plan.key.toLowerCase() && p.unit_amount === plan.amount
    )

    let price
    if (existing) {
      price = existing
      console.log(`⏭️  Prix ${plan.name} (${plan.amount / 100}€) déjà existant : ${price.id}`)
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: 'eur',
        recurring: { interval: 'month' },
        nickname: `Autyvia ${plan.name} — ${plan.tokens} tokens/mois`,
        metadata: { plan: plan.key.toLowerCase() },
      })
      console.log(`✅ Prix ${plan.name} créé : ${price.id}  (${plan.amount / 100}€/mois)`)
    }

    createdPrices[envKey] = price.id
  }

  // Mettre à jour .env.local
  let updated = envContent

  for (const [key, value] of Object.entries(createdPrices)) {
    if (updated.includes(`${key}=`)) {
      updated = updated.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
    } else {
      updated += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(ENV_PATH, updated, 'utf-8')

  console.log('\n✅ .env.local mis à jour :')
  for (const [key, value] of Object.entries(createdPrices)) {
    console.log(`   ${key}=${value}`)
  }

  console.log('\n🎉 Terminé ! Redémarre ton serveur Next.js pour prendre en compte les nouvelles variables.\n')
}

run().catch(err => {
  console.error('❌ Erreur :', err.message)
  process.exit(1)
})
