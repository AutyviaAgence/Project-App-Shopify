'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, MessageSquare, ShoppingBag, Trophy } from 'lucide-react'

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
      {/* ── Vue d'ensemble ──
          ⚠️ L'ENTONNOIR A ÉTÉ RETIRÉ, ET L'ÉTAGE « OUVERTS » AVEC.
          Un entonnoir suppose que chaque étage rétrécit. Or « ouverts » affichait
          systématiquement 100 % : sur WhatsApp, une « ouverture » n'est qu'une coche
          bleue (accusé de lecture), que la plupart des clients désactivent. La donnée
          n'est donc PAS fiable — l'afficher comme un fait trompait le marchand
          (3 envoyés → 3 ouverts → 3 réponses = 100 % partout, sur ta capture).
          On ne garde que le mesurable : envoyé, répondu, converti en vente. */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold">Vue d’ensemble</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Vos messages d’automatisation sur la période (les réponses SAV ne comptent pas).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <BigStat icon={MessageSquare} label="Messages envoyés" value={funnel.sent} />
          <BigStat
            icon={MessageSquare}
            label="Réponses reçues"
            value={funnel.responded}
            sub={`${funnel.responseRate}% de réponse`}
          />
          <BigStat
            icon={ShoppingBag}
            label="Ventes générées"
            value={funnel.ordered}
            sub={`${funnel.orderRate}% de conversion`}
            accent
          />
        </div>

        {/* Le taux de conversion est LE chiffre qui compte : combien de messages ont
            mené à un achat. C'est ce que le marchand veut vraiment savoir. */}
        {funnel.sent > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {funnel.ordered > 0
              ? `Sur ${funnel.sent} message${funnel.sent > 1 ? 's' : ''}, ${funnel.ordered} ${
                  funnel.ordered > 1 ? 'ont' : 'a'
                } abouti à une vente.`
              : `Aucune vente attribuée pour l’instant. Les ventes apparaissent quand un client commande après avoir reçu un message.`}
          </p>
        )}
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

              {/* Taux fiables uniquement. « Ouverture » a été retirée ici comme dans
                  la vue d'ensemble : sur WhatsApp, elle n'est qu'une coche bleue, que
                  la plupart des clients désactivent — elle affichait donc 100 %. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
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

/** Un taux (%), utilisé dans les cartes par automatisation. */
function Metric({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-2.5 text-center', accent && 'border-emerald-500/30 bg-emerald-500/5')}>
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className={cn('mt-0.5 text-lg font-bold tabular-nums', accent && 'text-emerald-600')}>{value}%</div>
    </div>
  )
}

/** Un chiffre BRUT (pas un %), pour la vue d'ensemble : envoyés, réponses, ventes. */
function BigStat({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  accent?: boolean
}) {
  return (
    <div className={cn('rounded-xl border p-4', accent && 'border-emerald-500/30 bg-emerald-500/5')}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', accent && 'text-emerald-600')}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
