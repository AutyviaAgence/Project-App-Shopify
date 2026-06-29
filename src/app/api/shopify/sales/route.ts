import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type OrderRow = { total_price: number | string; currency: string | null; is_whatsapp: boolean; ordered_at: string; country: string | null }

/**
 * GET /api/shopify/sales?months=6
 * Agrège le chiffre d'affaires Shopify par mois pour l'utilisateur courant.
 * Renvoie le CA total et la part attribuée à WhatsApp (contacts opt-in).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const months = Math.min(24, Math.max(1, parseInt(req.nextUrl.searchParams.get('months') || '6', 10)))

  // Borne basse : début du mois, il y a (months - 1) mois.
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))

  // `shopify_orders` n'est pas dans les types générés → cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('shopify_orders')
    .select('total_price, currency, is_whatsapp, ordered_at, country')
    .eq('user_id', user.id)
    .gte('ordered_at', start.toISOString())
    .order('ordered_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as OrderRow[]

  // Prépare les buckets mensuels (YYYY-MM) sur la fenêtre, à zéro.
  const buckets: { month: string; total: number; whatsapp: number }[] = []
  const index = new Map<string, number>()
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    index.set(key, buckets.length)
    buckets.push({ month: key, total: 0, whatsapp: 0 })
  }

  let currency: string | null = null
  let totalAll = 0
  let totalWhatsapp = 0
  const countryCount = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.ordered_at)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const bi = index.get(key)
    const amount = typeof r.total_price === 'string' ? parseFloat(r.total_price) : r.total_price
    const val = isNaN(amount) ? 0 : amount
    if (bi != null) {
      buckets[bi].total += val
      if (r.is_whatsapp) buckets[bi].whatsapp += val
    }
    totalAll += val
    if (r.is_whatsapp) totalWhatsapp += val
    if (!currency && r.currency) currency = r.currency
    if (r.country) countryCount.set(r.country, (countryCount.get(r.country) || 0) + 1)
  }
  const countries = Array.from(countryCount.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)

  // Arrondi à 2 décimales pour l'affichage.
  for (const b of buckets) {
    b.total = Math.round(b.total * 100) / 100
    b.whatsapp = Math.round(b.whatsapp * 100) / 100
  }

  return NextResponse.json({
    data: {
      currency: currency || 'EUR',
      months: buckets,
      totalAll: Math.round(totalAll * 100) / 100,
      totalWhatsapp: Math.round(totalWhatsapp * 100) / 100,
      countries,
    },
  })
}
