import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type OptinRow = {
  id: string
  phone_number: string | null
  name: string | null
  opt_in_source: string | null
  opt_in_at: string | null
  created_at: string
}

/**
 * GET /api/stats/optins?period=30&granularity=day&session_id=all
 * Liste les contacts opted-in (opt_in_status='subscribed') du marchand, avec
 * leur source, + une série temporelle (par jour ou par mois) et le décompte
 * par source. Scopé aux sessions WhatsApp de l'utilisateur.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const period = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get('period') || '30', 10)))
  const granularity = req.nextUrl.searchParams.get('granularity') === 'month' ? 'month' : 'day'
  const sessionFilter = req.nextUrl.searchParams.get('session_id') || 'all'

  // Sessions du user
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
  let sessionIds = (sessions || []).map((s) => s.id)
  if (sessionFilter !== 'all') sessionIds = sessionIds.filter((id) => id === sessionFilter)
  if (sessionIds.length === 0) {
    return NextResponse.json({ data: { total: 0, bySource: [], series: [], contacts: [] } })
  }

  const from = new Date()
  from.setUTCDate(from.getUTCDate() - (period - 1))
  from.setUTCHours(0, 0, 0, 0)

  // Contacts opted-in dans la fenêtre. On filtre sur opt_in_at (fallback created_at).
  const { data, error } = await supabase
    .from('contacts')
    .select('id, phone_number, name, opt_in_source, opt_in_at, created_at')
    .in('session_id', sessionIds)
    .eq('opt_in_status', 'subscribed')
    .gte('opt_in_at', from.toISOString())
    .order('opt_in_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data || []) as OptinRow[]

  // Décompte par source.
  const sourceCount = new Map<string, number>()
  for (const r of rows) {
    const src = r.opt_in_source || 'unknown'
    sourceCount.set(src, (sourceCount.get(src) || 0) + 1)
  }
  const bySource = Array.from(sourceCount.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  // Série temporelle (buckets jour ou mois) initialisés à zéro.
  const series: { date: string; count: number }[] = []
  const index = new Map<string, number>()
  if (granularity === 'month') {
    const months = Math.max(1, Math.ceil(period / 30))
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
    for (let i = 0; i <= months; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (index.has(key)) continue
      index.set(key, series.length)
      series.push({ date: key + '-01', count: 0 })
    }
  } else {
    for (let i = 0; i < period; i++) {
      const d = new Date(from)
      d.setUTCDate(from.getUTCDate() + i)
      const key = d.toISOString().slice(0, 10)
      index.set(key, series.length)
      series.push({ date: key, count: 0 })
    }
  }
  for (const r of rows) {
    const ts = r.opt_in_at || r.created_at
    if (!ts) continue
    const key = granularity === 'month' ? ts.slice(0, 7) + '-01' : ts.slice(0, 10)
    const lookup = granularity === 'month' ? ts.slice(0, 7) : ts.slice(0, 10)
    const bi = index.get(granularity === 'month' ? lookup : key)
    if (bi != null) series[bi].count++
  }

  // Liste pour le tableau (les 500 plus récents).
  const contacts = rows.slice(0, 500).map((r) => ({
    id: r.id,
    phone_number: r.phone_number,
    name: r.name,
    source: r.opt_in_source || null,
    opted_at: r.opt_in_at || r.created_at,
  }))

  return NextResponse.json({
    data: { total: rows.length, bySource, series, contacts },
  })
}
