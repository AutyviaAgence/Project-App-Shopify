'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Send, Eye, MessageCircle, ShoppingBag, Trophy, Info, MousePointerClick, CheckCheck, AlertTriangle, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Panneau PERFORMANCE d'une campagne/automatisation (slide-over droit).
 * Consomme GET /api/automations/[id]/performance?days=. Affiche un funnel type
 * Meta Ads, les résultats A/B (+ gagnant), les clics par bouton et le récap des
 * jobs. Les métriques opened/responded/ordered sont approximatives (par contact)
 * → signalé par une infobulle honnête.
 */

type Perf = {
  name: string
  days: number
  unified: { sent: number; delivered: number; deliveredRate: number; read: number; readRate: number; responded: number; responseRate: number; ordered: number; orderRate: number; failed: number; hasDelivery: boolean }
  funnel: { sent: number; opened: number; openRate: number; responded: number; responseRate: number; ordered: number; orderRate: number }
  delivery: { sent: number; delivered: number; deliveredRate: number; read: number; readRate: number; failed: number; failedRate: number } | null
  revenue: { orders: number; amount: number; currency: string | null } | null
  abTests: {
    nodeId: string
    name: string
    winner: string | null
    variants: { key: string; label: string; sent: number; opened: number; responded: number; ordered: number; openRate: number; responseRate: number; orderRate: number }[]
  }[]
  buttonClicks: { total: number; branches: { label: string; count: number; rate: number; responded: number; ordered: number; orderRate: number }[] }
  jobs: { byStatus: Record<string, number>; topSkipReasons: { reason: string; count: number }[] }
}

const DAYS_OPTIONS = [7, 30, 90]

export function PerformancePanel({ automationId, name, onClose }: { automationId: string; name: string; onClose: () => void }) {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [perf, setPerf] = useState<Perf | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/automations/${automationId}/performance?days=${days}`)
      const json = await res.json()
      if (res.ok) setPerf(json.data)
    } catch { /* réseau : on laisse l'état vide */ } finally {
      setLoading(false)
    }
  }, [automationId, days])

  useEffect(() => { load() }, [load])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Fond */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40" onClick={onClose}
      />
      {/* Panneau */}
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">Performance</h2>
            <p className="truncate text-xs text-muted-foreground">{name || perf?.name || 'Automatisation'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sélecteur de période */}
        <div className="flex items-center gap-1.5 border-b px-5 py-2.5">
          <span className="mr-1 text-xs text-muted-foreground">Période :</span>
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >{d} j</button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !perf ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Aucune donnée pour cette période.</p>
          ) : perf.funnel.sent === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium">Pas encore d&apos;envois</p>
              <p className="mt-1 text-xs text-muted-foreground">Les chiffres apparaîtront dès les premiers envois de cette automatisation.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* CA GÉNÉRÉ (le chiffre roi) — mis en avant en tête. */}
              {perf.revenue && perf.revenue.orders > 0 && (
                <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                    <ShoppingBag className="h-4 w-4" /> CA généré (attribué)
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-green-700 dark:text-green-400">
                      {perf.revenue.amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-lg font-semibold text-green-700/70 dark:text-green-400/70">{perf.revenue.currency || '€'}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {perf.revenue.orders} commande{perf.revenue.orders > 1 ? 's' : ''} attribuée{perf.revenue.orders > 1 ? 's' : ''} sur {perf.days} j
                  </p>
                </div>
              )}

              {/* FUNNEL UNIFIÉ — un seul entonnoir clair, à l'échelle des contacts. */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Parcours des contacts</h3>
                <div className="space-y-1.5">
                  <FunnelRow label="Envoyés" value={perf.unified.sent} pct={100} icon={<Send className="h-4 w-4" />} tone="#64748b" />
                  {perf.unified.hasDelivery && (
                    <FunnelRow label="Livrés" value={perf.unified.delivered} pct={perf.unified.deliveredRate} icon={<CheckCheck className="h-4 w-4" />} tone="#0ea5e9" />
                  )}
                  <FunnelRow label="Lus" value={perf.unified.read} pct={perf.unified.readRate} icon={<Eye className="h-4 w-4" />} tone="#8b5cf6" />
                  <FunnelRow label="Ont répondu" value={perf.unified.responded} pct={perf.unified.responseRate} icon={<MessageCircle className="h-4 w-4" />} tone="#a855f7" />
                  <FunnelRow label="Ventes" value={perf.unified.ordered} pct={perf.unified.orderRate} icon={<ShoppingBag className="h-4 w-4" />} tone="#22c55e" />
                </div>
                {perf.unified.failed > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-[12px] text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {perf.unified.failed} échec{perf.unified.failed > 1 ? 's' : ''} de livraison
                  </p>
                )}
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {perf.unified.hasDelivery
                    ? 'Livrés / lus : accusés Meta réels. Réponses et ventes : attribuées par contact.'
                    : 'Ouvertures, réponses et ventes attribuées par contact (approximation).'}
                </p>
              </section>

              {/* CLICS PAR BOUTON */}
              {perf.buttonClicks.total > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <MousePointerClick className="h-4 w-4" /> Détail par réponse (bouton)
                  </h3>
                  <div className="space-y-2.5">
                    {perf.buttonClicks.branches.map((b) => (
                      <div key={b.label} className="rounded-lg border p-2.5">
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold">« {b.label} »</span>
                          <span className="text-xs text-muted-foreground">{b.count} clic{b.count > 1 ? 's' : ''} · {b.rate}% des clics</span>
                        </div>
                        <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${b.rate}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <MiniStat label="Clics" value={String(b.count)} />
                          <MiniStat label="Répondu" value={String(b.responded)} sub={`${b.count ? Math.round(b.responded / b.count * 100) : 0}%`} />
                          <MiniStat label="Ventes" value={String(b.ordered)} sub={`${b.orderRate}%`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* TESTS A/B — un bloc par test (plusieurs possibles dans un workflow) */}
              {perf.abTests.map((test) => (
                <section key={test.nodeId}>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <FlaskConical className="h-4 w-4 text-fuchsia-500" /> {test.name}
                  </h3>
                  <div className="space-y-2">
                    {test.variants.map((v) => {
                      const isWinner = test.winner === v.key
                      return (
                        <div key={v.key} className={cn('rounded-lg border p-2.5', isWinner && 'border-green-500/50 bg-green-500/5')}>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                              <span className="truncate">{v.label}</span>
                              {isWinner && <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600"><Trophy className="h-3 w-3" /> Gagnant</span>}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">{v.sent} envoyés</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-center">
                            <MiniStat label="Ouverts" value={String(v.opened)} sub={`${v.openRate}%`} />
                            <MiniStat label="Répondu" value={String(v.responded)} sub={`${v.responseRate}%`} />
                            <MiniStat label="Ventes" value={String(v.ordered)} sub={`${v.orderRate}%`} />
                          </div>
                        </div>
                      )
                    })}
                    {test.winner == null && test.variants.some((v) => v.sent < 5) && (
                      <p className="text-[11px] text-muted-foreground">Gagnant déterminé dès 5 envois par variante.</p>
                    )}
                  </div>
                </section>
              ))}

              {/* JOBS */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Exécution</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Metric compact label="Envoyés" value={perf.jobs.byStatus.sent || 0} tone="green" />
                  <Metric compact label="Ignorés" value={perf.jobs.byStatus.skipped || 0} tone="slate" />
                  <Metric compact label="Échoués" value={perf.jobs.byStatus.failed || 0} tone="rose" />
                </div>
                {(perf.jobs.byStatus.waiting || 0) > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">{perf.jobs.byStatus.waiting} en attente d&apos;un clic (funnel à boutons).</p>
                )}
                {perf.jobs.topSkipReasons.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Raisons principales</p>
                    {perf.jobs.topSkipReasons.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-muted-foreground">{r.reason}</span>
                        <span className="shrink-0 font-medium">{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

const TONES: Record<string, string> = {
  slate: 'text-slate-500',
  sky: 'text-sky-500',
  violet: 'text-violet-500',
  green: 'text-green-500',
  rose: 'text-rose-500',
}

function Metric({ icon, label, value, sub, tone = 'slate', approx, compact }: {
  icon?: React.ReactNode; label: string; value: number; sub?: string; tone?: string; approx?: boolean; compact?: boolean
}) {
  return (
    <div className={cn('rounded-lg border bg-card', compact ? 'p-2 text-center' : 'p-3')}>
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', compact && 'justify-center')}>
        {icon && <span className={TONES[tone]}>{icon}</span>}
        {label}{approx && <span className="text-[10px]">~</span>}
      </div>
      <div className={cn('mt-1 flex items-baseline gap-1.5', compact && 'justify-center')}>
        <span className="text-xl font-bold tabular-nums">{value.toLocaleString('fr-FR')}</span>
        {sub && <span className="text-sm font-medium text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

/** Une étape d'entonnoir : icône + libellé, valeur, barre proportionnelle + %. */
function FunnelRow({ label, value, pct, icon, tone }: { label: string; value: number; pct: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span style={{ color: tone }}>{icon}</span>{label}
        </span>
        <span className="text-sm">
          <span className="font-bold tabular-nums">{value.toLocaleString('fr-FR')}</span>
          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: tone }} />
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded bg-muted/50 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}
