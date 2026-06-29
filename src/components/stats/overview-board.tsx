'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Globe } from '@/components/ui/globe'
import { NumberTicker } from '@/components/ui/number-ticker'
import type { StatsResponse } from '@/types/stats'

type TemplateLite = { id: string; name: string; status: string }

// ── Carte de base (style Framer : noir, bordure translucide, radius 4px) ──────
function FrameCard({ className, children, gradient }: { className?: string; children: React.ReactNode; gradient?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[6px] border border-white/10 p-4',
        gradient ? 'bg-gradient-to-b from-black to-[#09090b]' : 'bg-black',
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
          className="flex-1 rounded-[1px] bg-white/80"
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
          stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <circle
          cx="150" cy="150" r={radius} fill="none"
          stroke="white" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-4xl font-bold text-white">+{p}%</span>
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

  useEffect(() => {
    let active = true
    fetch('/api/templates')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (active && json?.data) setTemplates(json.data.slice(0, 3)) })
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
  const monthlyBars = useMemo(() => {
    // Regroupe par mois (max 6 derniers)
    const byMonth = new Map<string, number>()
    for (const p of stats.charts.messagesOverTime) {
      const m = p.date.slice(0, 7)
      byMonth.set(m, (byMonth.get(m) || 0) + p.inbound + p.outbound)
    }
    return Array.from(byMonth.entries()).slice(-6).map(([m, v]) => ({ m, v }))
  }, [stats.charts.messagesOverTime])

  const respRate = o.responseRate ?? 0
  const nf = (n: number) => n.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')

  return (
    <div className="space-y-2">
      {/* ── Rang 1 : 4 mini-cartes ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FrameCard>
          <p className="text-sm text-white/60">Messages total</p>
          <p className="mt-1 text-3xl font-bold text-white"><NumberTicker value={o.totalMessages} /></p>
          <Trend value={o.messagesTrend} />
        </FrameCard>
        <FrameCard>
          <p className="text-sm text-white/60">Messages reçus</p>
          <p className="mt-1 text-3xl font-bold text-white"><NumberTicker value={o.messagesIn} /></p>
          <Trend value={null} />
        </FrameCard>
        <FrameCard>
          <p className="text-sm text-white/60">Conversations actives</p>
          <p className="mt-1 text-3xl font-bold text-white"><NumberTicker value={o.activeConversations} /></p>
          <Trend value={o.conversationsTrend} />
        </FrameCard>
        <FrameCard>
          <div className="flex items-start justify-between">
            <p className="text-sm text-white/60">Nouveaux contacts</p>
            {o.contactsTrend != null && o.contactsTrend < 0 && (
              <span className="rounded-[4px] bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-400">en baisse</span>
            )}
          </div>
          <p className="mt-1 text-3xl font-bold text-white"><NumberTicker value={o.newContacts} /></p>
          <Sparkline data={contactsSeries.length ? contactsSeries : [1, 2, 1, 3, 2, 4, 3, 5]} />
        </FrameCard>
      </div>

      {/* ── Rang 2 : 3 big cards ── */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        {/* Messages cette semaine */}
        <FrameCard gradient>
          <div className="flex items-start justify-between">
            <p className="text-base font-semibold text-white">{labels.perDay}</p>
            <ArrowUpRight className="h-4 w-4 text-white/40" />
          </div>
          <p className="mt-3 text-xs text-white/50">Cette semaine</p>
          <p className="mt-1 text-4xl font-bold text-white">+ {nf(messagesWeek)}</p>
          <Trend value={o.messagesTrend} />
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, respRate)}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm text-white/70">
            <li className="flex justify-between"><span>• Messages reçus</span><span className="font-semibold text-white">{nf(o.messagesIn)}</span></li>
            <li className="flex justify-between"><span>• Messages envoyés</span><span className="font-semibold text-white">{nf(o.messagesOut)}</span></li>
            <li className="flex justify-between"><span>• Conversations</span><span className="font-semibold text-white">{nf(o.totalConversations)}</span></li>
            <li className="flex justify-between"><span>• Contacts</span><span className="font-semibold text-white">{nf(o.totalContacts)}</span></li>
          </ul>
        </FrameCard>

        {/* Activité mensuelle (bar chart) */}
        <FrameCard gradient>
          <p className="text-base font-semibold text-white">Activité mensuelle</p>
          <p className="mt-0.5 text-xs text-white/50">6 derniers mois</p>
          <div className="mt-6 flex h-48 items-end justify-between gap-3">
            {(monthlyBars.length ? monthlyBars : [{ m: '—', v: 1 }]).map((b, i) => {
              const max = Math.max(1, ...monthlyBars.map(x => x.v))
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-[4px] bg-white" style={{ height: `${Math.max(8, (b.v / max) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-white/40">{b.m.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </FrameCard>

        {/* Taux de réponse IA + globe */}
        <FrameCard gradient className="relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-white">{labels.aiResponse}</p>
              <p className="mt-0.5 text-xs text-white/50">{respRate}% de réponses automatisées</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/40" />
          </div>
          <div className="relative mt-2 h-56">
            <Globe className="!top-8" />
          </div>
        </FrameCard>
      </div>

      {/* ── Rang 3 : Modèles WhatsApp + jauge ── */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="pt-4">
          <h3 className="text-xl font-bold text-white">{labels.templates}</h3>
          <p className="mt-1 text-sm text-white/50">{labels.templatesSub}</p>
          <div className="mt-4 space-y-2">
            {templates.length === 0 ? (
              <FrameCard><p className="text-sm text-white/50">Aucun modèle pour l’instant.</p></FrameCard>
            ) : templates.map(tpl => {
              const approved = tpl.status === 'approved'
              const pending = tpl.status === 'pending' || tpl.status === 'has_pending_changes'
              return (
                <Link key={tpl.id} href="/templates">
                  <FrameCard className="flex items-center gap-3 transition-colors hover:border-white/20">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </span>
                    <span className="flex-1 truncate font-medium text-white">{tpl.name}</span>
                    <span className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold ring-1',
                      approved ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                        : pending ? 'bg-amber-500/10 text-amber-400 ring-amber-500/30'
                        : 'bg-white/5 text-white/50 ring-white/15'
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
