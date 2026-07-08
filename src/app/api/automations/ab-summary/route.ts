import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Row = {
  automation_id: string; node_id: string; variant_key: string
  opened: boolean; responded: boolean; ordered: boolean
}

/**
 * GET /api/automations/ab-summary?days=30
 *
 * Vue d'ensemble de l'engagement des automatisations :
 *  - funnel global : envoyés → ouverts → répondus → ventes
 *  - par automatisation : les mêmes taux, + le détail des variantes A/B
 *
 * Source : ab_test_assignments (une ligne par envoi initié, opened/responded/
 * ordered remplis par les webhooks). variant_key='_' = envoi sans test A/B.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '30', 10)))
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString()

  // Tolérant à l'absence de la colonne `opened` (migration pas encore appliquée) :
  // on retente sans elle → le taux d'ouverture reste à 0 en attendant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data, error } = await (supabase as any)
    .from('ab_test_assignments')
    .select('automation_id, node_id, variant_key, opened, responded, ordered')
    .eq('user_id', user.id)
    .gte('assigned_at', since)
    .limit(50000)
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retry = await (supabase as any)
      .from('ab_test_assignments')
      .select('automation_id, node_id, variant_key, responded, ordered')
      .eq('user_id', user.id)
      .gte('assigned_at', since)
      .limit(50000)
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
    data = (retry.data || []).map((r: Record<string, unknown>) => ({ ...r, opened: false }))
    error = null
  }

  const rows = (data || []) as Row[]

  // Noms des automatisations.
  const autoIds = Array.from(new Set(rows.map((r) => r.automation_id)))
  const nameById = new Map<string, string>()
  if (autoIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: autos } = await (supabase as any)
      .from('automations').select('id, name, trigger_event').in('id', autoIds)
    for (const a of autos || []) nameById.set(a.id, a.name)
  }

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  // Funnel global.
  const g = { sent: rows.length, opened: 0, responded: 0, ordered: 0 }
  for (const r of rows) { if (r.opened) g.opened++; if (r.responded) g.responded++; if (r.ordered) g.ordered++ }
  const funnel = {
    sent: g.sent,
    opened: g.opened, openRate: rate(g.opened, g.sent),
    responded: g.responded, responseRate: rate(g.responded, g.sent),
    ordered: g.ordered, orderRate: rate(g.ordered, g.sent),
  }

  // Par automatisation (+ variantes A/B si présentes).
  const byAuto = new Map<string, { sent: number; opened: number; responded: number; ordered: number; variants: Map<string, { sent: number; opened: number; responded: number; ordered: number }> }>()
  for (const r of rows) {
    if (!byAuto.has(r.automation_id)) byAuto.set(r.automation_id, { sent: 0, opened: 0, responded: 0, ordered: 0, variants: new Map() })
    const a = byAuto.get(r.automation_id)!
    a.sent++; if (r.opened) a.opened++; if (r.responded) a.responded++; if (r.ordered) a.ordered++
    // On ne compte comme "variantes A/B" que les vraies variantes (≠ '_').
    if (r.variant_key !== '_') {
      if (!a.variants.has(r.variant_key)) a.variants.set(r.variant_key, { sent: 0, opened: 0, responded: 0, ordered: 0 })
      const v = a.variants.get(r.variant_key)!
      v.sent++; if (r.opened) v.opened++; if (r.responded) v.responded++; if (r.ordered) v.ordered++
    }
  }

  const automations = Array.from(byAuto.entries()).map(([id, a]) => {
    const variants = Array.from(a.variants.entries()).map(([key, v]) => ({
      key, sent: v.sent,
      openRate: rate(v.opened, v.sent), responseRate: rate(v.responded, v.sent), orderRate: rate(v.ordered, v.sent),
    })).sort((x, y) => x.key.localeCompare(y.key))
    // Gagnant A/B : meilleur taux de vente, sinon de réponse (≥5 envois).
    let winner: string | null = null
    const scored = variants.filter((v) => v.sent >= 5)
    if (scored.length > 1) {
      scored.sort((x, y) => (y.orderRate - x.orderRate) || (y.responseRate - x.responseRate))
      winner = scored[0].key
    }
    return {
      id, name: nameById.get(id) || 'Automatisation',
      sent: a.sent,
      openRate: rate(a.opened, a.sent), responseRate: rate(a.responded, a.sent), orderRate: rate(a.ordered, a.sent),
      hasAbTest: variants.length > 1,
      variants, winner,
    }
  }).sort((x, y) => y.sent - x.sent)

  return NextResponse.json({ data: { funnel, automations } })
}
