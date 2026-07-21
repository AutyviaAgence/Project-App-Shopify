'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, UserCheck, ShoppingBag, MessageSquare, HelpCircle, Phone, CreditCard } from 'lucide-react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { formatPhoneNumber } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'

const TimeSeriesChart = dynamic(() => import('@/components/stats/charts').then(m => ({ default: m.TimeSeriesChart })))

type OptinContact = { id: string; phone_number: string | null; name: string | null; source: string | null; opted_at: string }
type OptinData = {
  total: number
  bySource: { source: string; count: number }[]
  series: { date: string; count: number }[]
  contacts: OptinContact[]
}

/** Clé i18n + icône lisibles pour une source d'opt-in. */
function sourceMeta(source: string | null): { labelKey: string; icon: typeof ShoppingBag; cls: string } {
  switch (source) {
    case 'shopify_storefront': return { labelKey: 'stats.opt_source_shopify', icon: ShoppingBag, cls: 'text-blue-500 bg-blue-500/10' }
    case 'checkout': return { labelKey: 'stats.opt_source_checkout', icon: CreditCard, cls: 'text-violet-500 bg-violet-500/10' }
    case 'inbound_message': return { labelKey: 'stats.opt_source_inbound', icon: MessageSquare, cls: 'text-emerald-500 bg-emerald-500/10' }
    default: return { labelKey: 'stats.opt_source_other', icon: HelpCircle, cls: 'text-muted-foreground bg-muted' }
  }
}

export function OptinsTab({ period, sessionId, locale }: { period: string; sessionId: string; locale: string }) {
  const { t } = useTranslation()
  const [data, setData] = useState<OptinData | null>(null)
  const [loading, setLoading] = useState(true)
  const [granularity, setGranularity] = useState<'day' | 'month'>('day')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ period, granularity })
        if (sessionId !== 'all') params.set('session_id', sessionId)
        const res = await fetch(`/api/stats/optins?${params}`)
        const json = res.ok ? await res.json() : null
        if (active && json?.data) setData(json.data)
      } catch {
        /* no-op */
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [period, sessionId, granularity])

  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US'
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(numberLocale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [numberLocale]
  )

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      {/* Compteurs : total + par source */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserCheck className="h-4 w-4 text-primary" /> {t('stats.opt_total')}
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">{data.total.toLocaleString(numberLocale)}</p>
        </div>
        {(['shopify_storefront', 'checkout', 'inbound_message'] as const).map((src) => {
          const m = sourceMeta(src)
          const count = data.bySource.find(s => s.source === src)?.count || 0
          return (
            <div key={src} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <m.icon className={cn('h-4 w-4', m.cls.split(' ')[0])} /> {t(m.labelKey)}
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight">{count.toLocaleString(numberLocale)}</p>
            </div>
          )
        })}
      </div>

      {/* Graphe d'évolution + bascule jour/mois */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{t('stats.opt_evolution')}</h3>
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
            {(['day', 'month'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn('rounded-md px-3 py-1 font-medium transition-colors',
                  granularity === g ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {g === 'day' ? t('stats.opt_by_day') : t('stats.opt_by_month')}
              </button>
            ))}
          </div>
        </div>
        {data.series.some(p => p.count > 0)
          ? <TimeSeriesChart data={data.series} title="optins" color="var(--primary,#3B82F6)" />
          : <p className="py-10 text-center text-sm text-muted-foreground">{t('stats.opt_no_optin_period')}</p>}
      </div>

      {/* Tableau des contacts opt-in */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-[15px] font-semibold">{t('stats.opt_contacts')}</h3>
        </div>
        {data.contacts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('stats.opt_no_optin_contact')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-5 py-3 font-medium">{t('stats.opt_col_contact')}</th>
                  <th className="px-5 py-3 font-medium">{t('stats.opt_col_phone')}</th>
                  <th className="px-5 py-3 font-medium">{t('stats.opt_col_source')}</th>
                  <th className="px-5 py-3 font-medium text-right">{t('stats.opt_col_date')}</th>
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((c, i) => {
                  const m = sourceMeta(c.source)
                  return (
                    <tr key={c.id} className={cn('border-b border-border/60 last:border-0', i % 2 === 0 ? '' : 'bg-muted/10')}>
                      <td className="px-5 py-3 font-medium">{c.name || t('stats.opt_unknown_contact')}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" /> {c.phone_number ? formatPhoneNumber(c.phone_number) : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium', m.cls)}>
                          <m.icon className="h-3 w-3" /> {t(m.labelKey)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {c.opted_at ? dateFmt.format(new Date(c.opted_at)) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
