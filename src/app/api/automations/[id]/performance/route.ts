import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/automations/[id]/performance?days=30
 *
 * Tableau de bord PERFORMANCE d'UNE campagne/automatisation (façon Meta Ads).
 * Agrège, sur la période demandée :
 *   - funnel : envoyés → ouverts → répondus → ventes (+ taux)
 *   - variantes A/B (si test A/B) + gagnant
 *   - clics par bouton (branche) : « Oui 62 % · Non 38 % »
 *   - récap des jobs par statut (envoyés / skippés / échoués / en attente de clic)
 *
 * Sources : ab_test_assignments (engagement) + automation_jobs (exécution).
 * NB : opened/responded/ordered sont marqués par contact (approximation
 * last-touch) — précision exacte = Phase 2 (receipts Meta rattachés au message).
 */

type AbRow = {
  node_id: string
  variant_key: string
  opened: boolean
  responded: boolean
  ordered: boolean
  clicked_branch: string | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '30', 10)))
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString()

  // Vérifie que l'automatisation appartient à l'utilisateur.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auto } = await (supabase as any)
    .from('automations').select('id, name').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!auto) return NextResponse.json({ error: 'Automatisation introuvable' }, { status: 404 })

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  // --- 1. Engagement (ab_test_assignments) ---------------------------------
  // Tolérant aux colonnes récentes (opened / clicked_branch) : retry dégradé si
  // une migration n'est pas encore appliquée → la métrique concernée reste à 0.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: abData, error: abErr } = await (supabase as any)
    .from('ab_test_assignments')
    .select('node_id, variant_key, opened, responded, ordered, clicked_branch')
    .eq('automation_id', id)
    .gte('assigned_at', since)
    .limit(50000)
  if (abErr) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retry = await (supabase as any)
      .from('ab_test_assignments')
      .select('node_id, variant_key, responded, ordered')
      .eq('automation_id', id)
      .gte('assigned_at', since)
      .limit(50000)
    abData = (retry.data || []).map((r: Record<string, unknown>) => ({ ...r, opened: false, clicked_branch: null }))
  }
  const rows = (abData || []) as AbRow[]

  // Funnel global.
  const g = { sent: rows.length, opened: 0, responded: 0, ordered: 0 }
  for (const r of rows) { if (r.opened) g.opened++; if (r.responded) g.responded++; if (r.ordered) g.ordered++ }
  const funnel = {
    sent: g.sent,
    opened: g.opened, openRate: rate(g.opened, g.sent),
    responded: g.responded, responseRate: rate(g.responded, g.sent),
    ordered: g.ordered, orderRate: rate(g.ordered, g.sent),
  }

  // Variantes A/B (variant_key ≠ '_' et ≠ '_send').
  const vMap = new Map<string, { sent: number; opened: number; responded: number; ordered: number }>()
  for (const r of rows) {
    if (r.variant_key === '_' || r.variant_key === '_send') continue
    if (!vMap.has(r.variant_key)) vMap.set(r.variant_key, { sent: 0, opened: 0, responded: 0, ordered: 0 })
    const v = vMap.get(r.variant_key)!
    v.sent++; if (r.opened) v.opened++; if (r.responded) v.responded++; if (r.ordered) v.ordered++
  }
  const variants = Array.from(vMap.entries()).map(([key, v]) => ({
    key, sent: v.sent,
    openRate: rate(v.opened, v.sent), responseRate: rate(v.responded, v.sent), orderRate: rate(v.ordered, v.sent),
  })).sort((a, b) => a.key.localeCompare(b.key))
  // Gagnant : meilleur taux de vente puis de réponse (≥5 envois pour être fiable).
  let winner: string | null = null
  const scored = variants.filter((v) => v.sent >= 5)
  if (scored.length > 1) {
    scored.sort((x, y) => (y.orderRate - x.orderRate) || (y.responseRate - x.responseRate))
    winner = scored[0].key
  }

  // Clics par bouton (branche) : clicked_branch = 'button:<libellé>'.
  const clickMap = new Map<string, number>()
  let totalClicks = 0
  for (const r of rows) {
    if (!r.clicked_branch) continue
    const label = r.clicked_branch.startsWith('button:') ? r.clicked_branch.slice('button:'.length) : r.clicked_branch
    clickMap.set(label, (clickMap.get(label) || 0) + 1)
    totalClicks++
  }
  const buttonClicks = Array.from(clickMap.entries())
    .map(([label, count]) => ({ label, count, rate: rate(count, totalClicks) }))
    .sort((a, b) => b.count - a.count)

  // --- 1b. Livraison réelle (messages rattachés à l'automatisation) ---------
  // Phase 2 : les messages sortants portent désormais wa_message_id + automation_id,
  // et le webhook horodate sent/delivered/read via les accusés Meta. On en tire le
  // vrai funnel de livraison. Tolérant si les colonnes n'existent pas encore.
  let delivery: { sent: number; delivered: number; read: number; failed: number } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgs, error: mErr } = await (supabase as any)
      .from('messages')
      .select('status, delivered_at, read_at')
      .eq('automation_id', id)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .limit(50000)
    if (!mErr && Array.isArray(msgs)) {
      const d = { sent: msgs.length, delivered: 0, read: 0, failed: 0 }
      for (const m of msgs as { status: string; delivered_at: string | null; read_at: string | null }[]) {
        if (m.delivered_at || m.status === 'delivered' || m.status === 'read') d.delivered++
        if (m.read_at || m.status === 'read') d.read++
        if (m.status === 'failed') d.failed++
      }
      // On n'expose la livraison que s'il y a des messages tracés (sinon la
      // colonne automation_id n'est pas encore alimentée → on masque la section).
      if (msgs.length > 0) {
        delivery = {
          sent: d.sent,
          delivered: d.delivered,
          read: d.read,
          failed: d.failed,
        }
      }
    }
  } catch { /* colonnes Phase 2 pas encore déployées → pas de section livraison */ }

  // --- 1c. Revenu attribué (Phase 3) ---------------------------------------
  // CA généré par cette automatisation : commandes attribuées (last-touch borné)
  // dans la période. Tolérant si la table n'existe pas encore.
  let revenue: { orders: number; amount: number; currency: string | null } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conv, error: cErr } = await (supabase as any)
      .from('attributed_conversions')
      .select('amount, currency')
      .eq('automation_id', id)
      .gte('attributed_at', since)
      .limit(50000)
    if (!cErr && Array.isArray(conv)) {
      const amount = conv.reduce((s: number, r: { amount: number | string }) => s + Number(r.amount || 0), 0)
      revenue = {
        orders: conv.length,
        amount: Math.round(amount * 100) / 100,
        currency: (conv[0]?.currency as string) || null,
      }
    }
  } catch { /* table Phase 3 pas encore déployée */ }

  // --- 2. Exécution (automation_jobs) --------------------------------------
  // Récap par statut sur la période. status ∈ pending/sent/skipped/failed/waiting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await (supabase as any)
    .from('automation_jobs')
    .select('status, result')
    .eq('automation_id', id)
    .gte('created_at', since)
    .limit(50000)
  const jobStatus: Record<string, number> = { pending: 0, sent: 0, skipped: 0, failed: 0, waiting: 0 }
  const skipReasons = new Map<string, number>()
  for (const j of (jobs || []) as { status: string; result: string | null }[]) {
    jobStatus[j.status] = (jobStatus[j.status] || 0) + 1
    if ((j.status === 'skipped' || j.status === 'failed') && j.result) {
      skipReasons.set(j.result, (skipReasons.get(j.result) || 0) + 1)
    }
  }
  const topSkipReasons = Array.from(skipReasons.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Funnel de livraison exact (Phase 2), avec taux. null tant que non alimenté.
  const deliveryFunnel = delivery ? {
    sent: delivery.sent,
    delivered: delivery.delivered, deliveredRate: rate(delivery.delivered, delivery.sent),
    read: delivery.read, readRate: rate(delivery.read, delivery.sent),
    failed: delivery.failed, failedRate: rate(delivery.failed, delivery.sent),
  } : null

  return NextResponse.json({
    data: {
      name: auto.name,
      days,
      funnel,
      delivery: deliveryFunnel,
      revenue,
      abTest: { hasAbTest: variants.length > 1, variants, winner },
      buttonClicks: { total: totalClicks, branches: buttonClicks },
      jobs: { byStatus: jobStatus, topSkipReasons },
    },
  })
}
