import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Row = { node_id: string; variant_key: string; responded: boolean; ordered: boolean }

/**
 * GET /api/automations/[id]/ab-results
 * Résultats des tests A/B d'une automation : par nœud A/B et par variante,
 * nombre d'envois, taux de réponse, taux de commande. Le "gagnant" (variante
 * avec le meilleur taux de commande, sinon de réponse) est indiqué.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Vérifie que l'automation appartient à l'utilisateur.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auto } = await (supabase as any)
    .from('automations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  const owner = (auto as { user_id?: string } | null)?.user_id
  if (!auto || owner !== user.id) {
    return NextResponse.json({ error: 'Automation introuvable' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ab_test_assignments')
    .select('node_id, variant_key, responded, ordered')
    .eq('automation_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as Row[]

  // Agrège par nœud → variante.
  const byNode = new Map<string, Map<string, { sent: number; responded: number; ordered: number }>>()
  for (const r of rows) {
    if (!byNode.has(r.node_id)) byNode.set(r.node_id, new Map())
    const m = byNode.get(r.node_id)!
    if (!m.has(r.variant_key)) m.set(r.variant_key, { sent: 0, responded: 0, ordered: 0 })
    const v = m.get(r.variant_key)!
    v.sent++
    if (r.responded) v.responded++
    if (r.ordered) v.ordered++
  }

  const nodes = Array.from(byNode.entries()).map(([nodeId, variantsMap]) => {
    const variants = Array.from(variantsMap.entries()).map(([key, v]) => ({
      key,
      sent: v.sent,
      responded: v.responded,
      ordered: v.ordered,
      responseRate: v.sent > 0 ? Math.round((v.responded / v.sent) * 100) : 0,
      orderRate: v.sent > 0 ? Math.round((v.ordered / v.sent) * 100) : 0,
    })).sort((a, b) => a.key.localeCompare(b.key))
    // Gagnant : meilleur taux de commande, sinon meilleur taux de réponse.
    let winner: string | null = null
    const scored = [...variants].filter((v) => v.sent >= 5) // évite un gagnant sur trop peu de données
    if (scored.length > 0) {
      scored.sort((a, b) => (b.orderRate - a.orderRate) || (b.responseRate - a.responseRate))
      winner = scored[0].key
    }
    return { nodeId, variants, winner }
  })

  return NextResponse.json({ data: { nodes } })
}
