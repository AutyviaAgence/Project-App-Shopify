'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/i18n/context'
import { WhatsAppConnect } from '@/components/whatsapp-connect'
import { ShopifyConnect } from '@/components/shopify-connect'
import { TourGuideButton } from '@/components/guided-tour'
import { useTenant } from '@/lib/tenant/context'
import { Meteors } from '@/components/ui/meteors'
import { TypingAnimation } from '@/components/ui/typing-animation'
import { Activity, ArrowRight, Store, ShoppingCart, UserPlus, Megaphone, Bell, Zap } from 'lucide-react'

/**
 * ── ACCUEIL ──────────────────────────────────────────────────────────────────
 *
 * ⚠️ TOUS LES CHIFFRES AFFICHÉS ICI SONT MESURÉS. AUCUN N'EST INVENTÉ.
 *
 * Afficher des statistiques fabriquées est un motif de rejet App Store
 * (§1.1.4 — « apps that falsify data to deceive merchants »).
 *
 * Deux métriques de la maquette ont donc été ÉCARTÉES, faute de source :
 *  · « Satisfaction client 4.8/5 » — rien ne collecte de note client.
 *  · « Temps économisé » — aucune mesure ; une estimation présentée comme un
 *    fait reste un mensonge.
 *
 * À leur place : le CA réellement attribué à WhatsApp, qui répond à la seule
 * question qui compte pour le marchand — combien Xeyo me rapporte.
 */

type DashboardData = {
  health: {
    avgResponseMs: number | null
    resolutionRate: number | null
    whatsappRevenueCents: number
    currency: string
  }
  activity: Array<{ kind: string; label: string; at: string }>
}

// Les articles pointeront vers le blog. Pas de lien pour l'instant : l'utilisateur
// fournira les URL réelles — mieux vaut un article inerte qu'un lien mort.
// Les libellés (titre/extrait) sont traduits via les clés `dashboard.article_*`.
const ARTICLES = [
  { image: '/blog/automatisations-whatsapp.webp', titleKey: 'dashboard.article_1_title', excerptKey: 'dashboard.article_1_excerpt' },
  { image: '/blog/taux-conversion-whatsapp.webp', titleKey: 'dashboard.article_2_title', excerptKey: 'dashboard.article_2_excerpt' },
  { image: '/blog/premier-agent-ia.webp', titleKey: 'dashboard.article_3_title', excerptKey: 'dashboard.article_3_excerpt' },
]

const ICONS: Record<string, typeof Store> = {
  store: Store,
  sync: Zap,
  order: ShoppingCart,
  optin: UserPlus,
  campaign: Megaphone,
}

/** « il y a 12 min » — plus lisible qu'une date pour un flux d'activité.
 *  Les libellés relatifs sont traduits ; `t` et `locale` viennent de l'appelant. */
function timeAgo(iso: string, t: (key: string, params?: Record<string, string | number>) => string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('dashboard.time_now')
  if (min < 60) return t('dashboard.time_min_ago', { min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('dashboard.time_hours_ago', { h })
  const d = Math.floor(h / 24)
  if (d < 30) return t('dashboard.time_days_ago', { d })
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US')
}

function DashboardHome() {
  const { t, locale } = useTranslation()
  const tenant = useTenant()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json?.data ?? null))
      .catch(() => setData(null))
  }, [])

  const health = data?.health
  const activity = data?.activity ?? []

  const revenue = health
    ? (health.whatsappRevenueCents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: health.currency || 'EUR',
        maximumFractionDigits: 0,
      })
    : null

  return (
    <div className="relative flex w-full flex-col gap-8 overflow-x-hidden p-4 pb-20 md:p-8 md:pt-12">
      {/* Météores en fond, dans une couche de clip dédiée : leurs traînées voyagent
          loin sous le conteneur et faisaient grandir la zone de défilement. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Meteors number={20} className="opacity-60" />
      </div>

      <div data-tour="header" data-page-header className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <TypingAnimation
            as="p"
            className="text-sm font-normal leading-normal tracking-normal text-muted-foreground"
            duration={70}
          >
            {t('dashboard.greeting')}
          </TypingAnimation>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{tenant.appName}</h1>
          <p className="max-w-xl pt-1 text-sm text-muted-foreground">
            {t('dashboard.home_subtitle')}
          </p>
        </div>
        {/* Guide interactif — déclenché depuis le dashboard (et non la topbar). */}
        <TourGuideButton className="shrink-0 self-start border border-border bg-background/60 backdrop-blur" />
      </div>

      {/* Connexions. Les ancres `data-tour` permettent à l'assistant d'aide de
          POINTER ces cartes : quand un marchand demande « où je connecte
          WhatsApp ? », l'assistant l'amène ici et surligne la bonne carte. */}
      <div className="relative z-10 grid gap-4 md:grid-cols-2">
        <div data-tour="whatsapp-connect">
          <WhatsAppConnect />
        </div>
        <div data-tour="shopify-connect">
          <ShopifyConnect />
        </div>
      </div>

      {/* ── Activité récente + Santé de l'agent ───────────────────────────── */}
      <div className="relative z-10 grid gap-4 lg:grid-cols-2">
        {/* Activité récente */}
        <div className="rounded-2xl border border-white/10 bg-card/50 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{t('dashboard.recent_activity')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.recent_activity_sub', { appName: tenant.appName })}
              </p>
            </div>
          </div>

          {activity.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {activity.map((item, i) => {
                const Icon = ICONS[item.kind] ?? Bell
                return (
                  <li key={i} className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.at, t, locale)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              {t('dashboard.activity_empty')}
            </p>
          )}
        </div>

        {/* Santé de l'agent IA */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/50 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="text-base font-semibold">{t('dashboard.agent_health')}</h2>
          </div>

          <div className="mt-4 flex items-end gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mascots/peeking.png"
              alt=""
              aria-hidden
              className="hidden h-24 w-auto shrink-0 object-contain sm:block"
            />

            <div className="grid flex-1 gap-2.5 sm:grid-cols-3">
              {/* ⚠️ `—` quand la donnée n'existe pas encore : on n'invente pas un
                  chiffre pour remplir la case. */}
              <Metric
                label={t('dashboard.metric_response_time')}
                value={health?.avgResponseMs != null ? `${(health.avgResponseMs / 1000).toFixed(1)} s` : '—'}
              />
              <Metric
                label={t('dashboard.metric_handled_no_human')}
                value={health?.resolutionRate != null ? `${health.resolutionRate} %` : '—'}
                hint={t('dashboard.metric_handled_hint')}
              />
              <Metric
                label={t('dashboard.metric_whatsapp_revenue')}
                value={revenue && health!.whatsappRevenueCents > 0 ? revenue : '—'}
                hint={t('dashboard.metric_this_month')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Blog ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('dashboard.blog_title', { appName: tenant.appName })}</h2>
          {/* Pas de lien tant que les URL réelles ne sont pas connues : un lien mort
              est pire que pas de lien. */}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {t('dashboard.blog_see_all')} <ArrowRight className="h-4 w-4" />
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {ARTICLES.map((a) => (
            <article
              key={a.titleKey}
              className="overflow-hidden rounded-2xl border border-white/10 bg-card/50"
            >
              <div className="relative h-32 overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image} alt="" aria-hidden className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <span className="inline-block rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t('dashboard.blog_new')}
                </span>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{t(a.titleKey)}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(a.excerptKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

export default function DashboardPage() {
  return <DashboardHome />
}
