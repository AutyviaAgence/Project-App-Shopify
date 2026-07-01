'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Globe } from '@/components/ui/globe'
import { NumberTicker } from '@/components/ui/number-ticker'
import { countryToCoords } from '@/lib/country-coords'
import type { StatsResponse } from '@/types/stats'

type TemplateLite = { id: string; name: string; status: string }
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

// ── Jauge circulaire (arc) ───────────────────────────────────────────────────
function Gauge({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent))
  // Arc de 270° (style Framer), trait épais.
  const radius = 120
  const stroke = 28
  const circ = 2 * Math.PI * radius
  const arc = 0.75 // 270°
  const dash = circ * arc
  const filled = dash * (p / 100)
  return (
    <div className="relative flex aspect-square w-full max-w-[320px] items-center justify-center">
      <svg viewBox="0 0 300 300" className="w-full -rotate-[225deg]">
        <circle
          cx="150" cy="150" r={radius} fill="none"
          className="stroke-border" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <circle
          cx="150" cy="150" r={radius} fill="none"
          className="stroke-foreground" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-4xl font-bold text-foreground">+{p}%</span>
      </div>
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
  labels: { title: string; perDay: string; aiResponse: string; templates: string; templatesSub: string }
}) {
  const o = stats.overview
  const [templates, setTemplates] = useState<TemplateLite[]>([])
  const [sales, setSales] = useState<SalesData | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/templates')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (active && json?.data) setTemplates(json.data.slice(0, 3)) })
      .catch(() => {})
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

      {/* ── Rang 3 : Modèles WhatsApp + jauge ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="pt-4">
          <h3 className="text-xl font-bold text-foreground">{labels.templates}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{labels.templatesSub}</p>
          <div className="mt-4 space-y-2">
            {templates.length === 0 ? (
              <FrameCard><p className="text-sm text-muted-foreground">Aucun modèle pour l’instant.</p></FrameCard>
            ) : templates.map(tpl => {
              const approved = tpl.status === 'approved'
              const pending = tpl.status === 'pending' || tpl.status === 'has_pending_changes'
              return (
                <Link key={tpl.id} href="/templates">
                  <FrameCard className="flex items-center gap-3 transition-colors hover:border-foreground/20">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </span>
                    <span className="flex-1 truncate font-medium text-foreground">{tpl.name}</span>
                    <span className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold ring-1',
                      approved ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                        : pending ? 'bg-amber-500/10 text-amber-400 ring-amber-500/30'
                        : 'bg-foreground/5 text-muted-foreground ring-border'
                    )}>
                      {approved ? 'Validé' : pending ? 'En attente' : 'Brouillon'}
                    </span>
                  </FrameCard>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Jauge */}
        <FrameCard gradient className="flex items-center justify-center py-8">
          <Gauge percent={respRate} />
        </FrameCard>
      </div>
    </div>
  )
}
