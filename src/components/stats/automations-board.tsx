'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Eye, MessageSquare, ShoppingBag, Trophy } from 'lucide-react'
import { EngagementFunnel } from '@/components/stats/engagement-funnel'

type Variant = { key: string; sent: number; openRate: number; responseRate: number; orderRate: number }
type AutoRow = {
  id: string; name: string; sent: number
  openRate: number; responseRate: number; orderRate: number
  hasAbTest: boolean; variants: Variant[]; winner: string | null
}
type Funnel = {
  sent: number; opened: number; openRate: number
  responded: number; responseRate: number; ordered: number; orderRate: number
}

/** Onglet Automatisations : entonnoir d'engagement + résultats A/B par automatisation. */
export function AutomationsBoard({ days }: { days: number }) {
  const [loading, setLoading] = useState(true)
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [rows, setRows] = useState<AutoRow[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/automations/ab-summary?days=${days}`)
        const json = res.ok ? await res.json() : null
        if (active && json?.data) { setFunnel(json.data.funnel); setRows(json.data.automations || []) }
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [days])

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
  }

  if (!funnel || funnel.sent === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-center">
        <p className="font-medium text-foreground">Aucun envoi d’automatisation sur la période</p>
        <p className="text-sm text-muted-foreground">Activez une automatisation (panier abandonné, relance…) pour voir vos résultats ici.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Entonnoir d'engagement (visuel 3D) ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold">Entonnoir d’engagement</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Ce que deviennent vos messages initiés (les réponses SAV ne comptent pas).</p>
        <div className="mx-auto h-[300px] w-full max-w-2xl">
          <EngagementFunnel steps={[
            { label: 'Messages envoyés', value: funnel.sent },
            { label: 'Ouverts', value: funnel.opened },
            { label: 'Réponses', value: funnel.responded },
            { label: 'Ventes', value: funnel.ordered },
          ]} />
        </div>
        {/* Taux clés sous l'entonnoir */}
        <div className="mx-auto mt-2 grid max-w-md grid-cols-3 gap-2">
          <Metric icon={Eye} label="Ouverture" value={funnel.openRate} />
          <Metric icon={MessageSquare} label="Réponse" value={funnel.responseRate} />
          <Metric icon={ShoppingBag} label="Vente" value={funnel.orderRate} accent />
        </div>
      </div>

      {/* ── Tests A/B en cours (mis en avant) ── */}
      {rows.some((a) => a.hasAbTest) && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-semibold">Tests A/B</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {rows.filter((a) => a.hasAbTest).length}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Vos automatisations qui comparent plusieurs messages, et la variante gagnante.</p>
          <div className="mt-4 space-y-3">
            {rows.filter((a) => a.hasAbTest).map((a) => (
              <AutoCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      {/* ── Toutes les automatisations ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold">Toutes les automatisations</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Taux d’ouverture, de réponse et de vente pour chaque automatisation active.</p>

        <div className="mt-4 space-y-3">
          {rows.filter((a) => !a.hasAbTest).length === 0 && rows.some((a) => a.hasAbTest) ? (
            <p className="text-sm text-muted-foreground">Toutes vos automatisations avec des envois sont des tests A/B (voir ci-dessus).</p>
          ) : rows.filter((a) => !a.hasAbTest).map((a) => (
            <AutoCard key={a.id} a={a} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Carte de résultats d'une automatisation (taux + variantes A/B éventuelles). */
function AutoCard({ a }: { a: AutoRow }) {
  return (
            <div key={a.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  {a.hasAbTest && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Test A/B</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{a.sent} envoi{a.sent > 1 ? 's' : ''}</span>
              </div>

              {/* 3 taux clés */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric icon={Eye} label="Ouverture" value={a.openRate} />
                <Metric icon={MessageSquare} label="Réponse" value={a.responseRate} />
                <Metric icon={ShoppingBag} label="Vente" value={a.orderRate} accent />
              </div>

              {/* Variantes A/B */}
              {a.hasAbTest && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-muted-foreground">
                        <th className="pb-1 font-medium">Variante</th>
                        <th className="pb-1 text-right font-medium">Envois</th>
                        <th className="pb-1 text-right font-medium">Ouv.</th>
                        <th className="pb-1 text-right font-medium">Rép.</th>
                        <th className="pb-1 text-right font-medium">Vente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.variants.map((v) => (
                        <tr key={v.key} className={cn('border-t', a.winner === v.key && 'bg-emerald-500/5')}>
                          <td className="py-1.5 font-medium">
                            <span className="inline-flex items-center gap-1">
                              {v.key}
                              {a.winner === v.key && <Trophy className="h-3.5 w-3.5 text-emerald-500" />}
                            </span>
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{v.sent}</td>
                          <td className="py-1.5 text-right tabular-nums">{v.openRate}%</td>
                          <td className="py-1.5 text-right tabular-nums">{v.responseRate}%</td>
                          <td className="py-1.5 text-right font-medium tabular-nums">{v.orderRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {a.winner && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                      <Trophy className="h-3.5 w-3.5" /> Variante <span className="font-semibold">{a.winner}</span> gagnante (meilleur taux de vente).
                    </p>
                  )}
                </div>
              )}
    </div>
  )
}

function Metric({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-2.5 text-center', accent && 'border-emerald-500/30 bg-emerald-500/5')}>
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className={cn('mt-0.5 text-lg font-bold tabular-nums', accent && 'text-emerald-600')}>{value}%</div>
    </div>
  )
}
