'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Globe } from '@/components/ui/globe'
import { NumberTicker } from '@/components/ui/number-ticker'
import { countryToCoords } from '@/lib/country-coords'
import type { StatsResponse } from '@/types/stats'

type SalesMonth = { month: string; total: number; whatsapp: number }
type SalesCountry = { country: string; count: number }
type SalesData = { currency: string; months: SalesMonth[]; totalAll: number; totalWhatsapp: number; countries?: SalesCountry[] }

// ── Carte de base (style Framer : noir, bordure translucide, radius 4px) ──────
function FrameCard({ className, children, gradient }: { className?: string; children: React.ReactNode; gradient?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border p-5',
        gradient ? 'bg-card' : 'bg-card',
        className
      )}
    >
      {children}
    </div>
  )
}

function Trend({ value, suffix = '% comparé au mois dernier' }: { value: number | null; suffix?: string }) {
  if (value == null) return null
  const up = value >= 0
  return (
    <p className={cn('mt-2 flex items-center gap-1 text-xs font-medium', up ? 'text-emerald-400' : 'text-red-400')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{value}{suffix}
    </p>
  )
}

// ── Mini sparkline (barres) ──────────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data)
  return (
    <div className="mt-2 flex h-10 items-end gap-[2px]">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-foreground/80"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function StatsOverviewBoard({
  stats,
  locale,
  labels,
}: {
  stats: StatsResponse
  locale: string
  labels: { title: string; perDay: string; aiResponse: string }
}) {
  const o = stats.overview
  const [sales, setSales] = useState<SalesData | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/shopify/sales?months=6')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (active && json?.data) setSales(json.data) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Données pour les graphiques
  const contactsSeries = useMemo(
    () => stats.charts.newContactsOverTime.slice(-24).map(p => p.count),
    [stats.charts.newContactsOverTime]
  )
  const messagesWeek = useMemo(
    () => stats.charts.messagesOverTime.slice(-7).reduce((s, p) => s + p.inbound + p.outbound, 0),
    [stats.charts.messagesOverTime]
  )

  const respRate = o.responseRate ?? 0
  const nf = (n: number) => n.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')

  // Marqueurs du globe : un point BLEU par pays de commande (taille selon le
  // volume). Sans données → liste vide (pas de points orange par défaut).
  const globeConfig = useMemo(() => {
    const list = sales?.countries || []
    const max = Math.max(1, ...list.map(c => c.count))
    const markers = list
      .map(c => {
        const loc = countryToCoords(c.country)
        if (!loc) return null
        return { location: loc, size: 0.04 + (c.count / max) * 0.08 }
      })
      .filter(Boolean) as { location: [number, number]; size: number }[]
    return {
      width: 800,
      height: 800,
      onRender: () => {},
      devicePixelRatio: 2,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: 1.2,
      baseColor: [1, 1, 1] as [number, number, number],
      markerColor: [0.23, 0.51, 0.96] as [number, number, number], // bleu #3B82F6
      glowColor: [1, 1, 1] as [number, number, number],
      markers, // vide si pas de ventes → aucun point parasite
    }
  }, [sales])
  const countryCount = sales?.countries?.length ?? 0

  return (
    <div className="space-y-3">
      {/* ── Rang 1 : 4 mini-cartes ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FrameCard>
          <p className="text-sm text-muted-foreground">Messages total</p>
          <p className="mt-1 text-3xl font-bold text-foreground"><NumberTicker value={o.totalMessages} /></p>
          <Trend value={o.messagesTrend} />
        </FrameCard>
        <FrameCard>
          <p className="text-sm text-muted-foreground">Messages reçus</p>
          <p className="mt-1 text-3xl font-bold text-foreground"><NumberTicker value={o.messagesIn} /></p>
          <Trend value={null} />
        </FrameCard>
        <FrameCard>
          <p className="text-sm text-muted-foreground">Conversations actives</p>
          <p className="mt-1 text-3xl font-bold text-foreground"><NumberTicker value={o.activeConversations} /></p>
          <Trend value={o.conversationsTrend} />
        </FrameCard>
        <FrameCard>
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Nouveaux contacts</p>
            {o.contactsTrend != null && o.contactsTrend < 0 && (
              <span className="rounded-[4px] bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-400">en baisse</span>
            )}
          </div>
          <p className="mt-1 text-3xl font-bold text-foreground"><NumberTicker value={o.newContacts} /></p>
          <Sparkline data={contactsSeries.length ? contactsSeries : [1, 2, 1, 3, 2, 4, 3, 5]} />
        </FrameCard>
      </div>

      {/* ── Rang 2 : 3 big cards ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Messages cette semaine */}
        <FrameCard gradient>
          <div className="flex items-start justify-between">
            <p className="text-base font-semibold text-foreground">{labels.perDay}</p>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Cette semaine</p>
          <p className="mt-1 text-4xl font-bold text-foreground">+ {nf(messagesWeek)}</p>
          <Trend value={o.messagesTrend} />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, respRate)}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm text-foreground/70">
            <li className="flex justify-between"><span>• Messages reçus</span><span className="font-semibold text-foreground">{nf(o.messagesIn)}</span></li>
            <li className="flex justify-between"><span>• Messages envoyés</span><span className="font-semibold text-foreground">{nf(o.messagesOut)}</span></li>
            <li className="flex justify-between"><span>• Conversations</span><span className="font-semibold text-foreground">{nf(o.totalConversations)}</span></li>
            <li className="flex justify-between"><span>• Contacts</span><span className="font-semibold text-foreground">{nf(o.totalContacts)}</span></li>
          </ul>
        </FrameCard>

        {/* Ventes Shopify (CA total + part WhatsApp) */}
        <FrameCard gradient>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">Ventes Shopify</p>
              <p className="mt-0.5 text-xs text-muted-foreground">6 derniers mois</p>
            </div>
            {sales && (
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{nf(Math.round(sales.totalAll))} <span className="text-xs font-medium text-muted-foreground">{sales.currency}</span></p>
                <p className="text-[11px] text-blue-400">dont {nf(Math.round(sales.totalWhatsapp))} via WhatsApp</p>
              </div>
            )}
          </div>
          {(() => {
            const ms = sales?.months || []
            const hasData = ms.some(m => m.total > 0)
            const max = Math.max(1, ...ms.map(m => m.total))
            if (!hasData) {
              return (
                <div className="mt-6 flex h-48 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>
                  <p className="text-[11px] text-muted-foreground/70">Les commandes apparaîtront ici dès réception.</p>
                </div>
              )
            }
            return (
              <>
                <div className="mt-6 flex h-44 items-end justify-between gap-3">
                  {ms.map((b, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-2">
                      {/* Barre empilée : total (clair) avec part WhatsApp (bleue) au pied */}
                      <div className="relative flex w-full flex-1 items-end">
                        <div className="w-full overflow-hidden rounded-t-[4px] bg-foreground/85" style={{ height: `${Math.max(4, (b.total / max) * 100)}%` }}>
                          {b.total > 0 && (
                            <div className="absolute bottom-0 w-full bg-blue-500" style={{ height: `${(b.whatsapp / max) * 100}%` }} />
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{b.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-foreground/85" /> Total</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500" /> WhatsApp</span>
                </div>
              </>
            )
          })()}
        </FrameCard>

        {/* Taux de réponse IA + globe (marqueurs = pays des ventes).
            Survol : la carte s'agrandit légèrement. Molette : zoom du globe. */}
        <FrameCard gradient className="group/globe relative overflow-hidden transition-all duration-300 hover:z-10 hover:scale-[1.04] hover:shadow-2xl">
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-foreground">{labels.aiResponse}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {countryCount > 0 ? `${countryCount} pays · ${respRate}% automatisé` : `${respRate}% de réponses automatisées`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          {/* Globe : par défaut zoomé/décalé (gros plan bas de carte). Au survol,
              il se dézoome et se recentre → on voit la Terre entière au milieu. */}
          <div className="relative mt-2 h-56">
            <div className="absolute inset-0 translate-y-8 scale-[1.35] transition-transform duration-500 ease-out group-hover/globe:translate-y-0 group-hover/globe:scale-90">
              <Globe className="!top-0" config={globeConfig} zoomable />
            </div>
          </div>
        </FrameCard>
      </div>
    </div>
  )
}
