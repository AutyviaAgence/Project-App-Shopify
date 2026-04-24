import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: { role: string | null } | null }
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Récupérer tous les profils avec stripe_customer_id
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id, stripe_subscription_id, subscription_status, plan')
    .not('stripe_customer_id', 'is', null)

  if (!profiles || profiles.length === 0) return NextResponse.json({ data: { subscriptions: [], invoices: [] } })

  // Récupérer les abonnements Stripe actifs/annulés
  const subscriptionResults = await Promise.allSettled(
    profiles
      .filter(p => p.stripe_subscription_id)
      .map(async p => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id) as any
        return {
          user_id: p.id,
          email: p.email,
          full_name: p.full_name,
          plan: p.plan,
          db_status: p.subscription_status,
          stripe_status: sub.status,
          stripe_subscription_id: p.stripe_subscription_id,
          current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
          amount: sub.items.data[0]?.price?.unit_amount ?? null,
          currency: sub.items.data[0]?.price?.currency ?? 'eur',
        }
      })
  )

  const subscriptions = subscriptionResults
    .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === 'fulfilled')
    .map(r => r.value)

  // Récupérer les dernières factures (100 max) pour tous les customers
  const customerIds = profiles.map(p => p.stripe_customer_id).filter(Boolean) as string[]

  // Stripe ne permet pas de filtrer par liste de customers en une requête — on récupère les 100 dernières globalement
  const invoicesResult = await stripe.invoices.list({ limit: 100, expand: ['data.customer'] })

  const invoices = invoicesResult.data
    .filter(inv => customerIds.includes(typeof inv.customer === 'string' ? inv.customer : (inv.customer as Stripe.Customer)?.id))
    .map(inv => {
      const customerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as Stripe.Customer)?.id
      const profileMatch = profiles.find(p => p.stripe_customer_id === customerId)
      return {
        id: inv.id,
        user_id: profileMatch?.id ?? null,
        email: profileMatch?.email ?? (inv.customer_email ?? ''),
        full_name: profileMatch?.full_name ?? null,
        plan: profileMatch?.plan ?? null,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created: new Date(inv.created * 1000).toISOString(),
        period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
        period_end: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
        invoice_url: inv.hosted_invoice_url ?? null,
        description: inv.description ?? (inv.lines.data[0]?.description ?? null),
      }
    })
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

  return NextResponse.json({ data: { subscriptions, invoices } })
}
