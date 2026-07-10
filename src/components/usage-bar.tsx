'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Zap, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barre de CRÉDITS IA (topbar globale). Affiche clairement les conversations IA
 * consommées vs incluses : « ⚡ Crédits IA — 340 / 1800 ».
 * - Couleur : vert → orange (≥80%) → rouge (≥95%)
 * - Bouton « Recharger » quand il reste peu de crédits
 * - free (IA off) : invitation à passer au payant
 * Rafraîchi toutes les 60 s. Clic → /subscription.
 */

type Usage = {
  plan: string
  ai_enabled: boolean
  conversations: {
    used: number
    limit: number | null
    remaining: number | null
    unlimited: boolean
    percentage: number
    fairUseCap: number | null
  }
}

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter', pro: 'Growth', scale: 'Scale', free: 'Gratuit',
}

export function UsageBar() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [buying, setBuying] = useState(false)

  // Achat d'un pack de crédits IA (recharge). Redirige vers Stripe Checkout.
  const rechargeCredits = async () => {
    setBuying(true)
    try {
      const res = await fetch('/api/stripe/buy-ai-credits', { method: 'POST' })
      const json = await res.json()
      if (json.url) window.location.href = json.url
      else setBuying(false)
    } catch {
      setBuying(false)
    }
  }

  useEffect(() => {
    let active = true
    const load = () => {
      fetch('/api/subscription/usage')
        .then(r => (r.ok ? r.json() : null))
        .then(json => { if (active && json?.data?.conversations) setUsage(json.data) })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (!usage) return null

  // Free (IA off) : invitation à passer au payant (pas de barre).
  if (!usage.ai_enabled) {
    return (
      <Link
        href="/subscription"
        className="flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span className="hidden sm:inline">IA désactivée</span>
        <span className="font-medium text-primary">Activer l’IA →</span>
      </Link>
    )
  }

  const { used, limit } = usage.conversations
  // Le quota est désormais fini pour tous les plans payants (crédits mensuels).
  const total = limit ?? usage.conversations.fairUseCap ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const low = pct >= 80
  const critical = pct >= 95

  // Couleur de la barre + libellé selon le niveau de conso.
  const barColor = critical
    ? 'from-rose-500 to-red-500'
    : low
      ? 'from-amber-500 to-orange-500'
      : 'from-emerald-500 to-teal-400'
  const textColor = critical ? 'text-rose-500' : low ? 'text-amber-600' : 'text-foreground'

  const planName = PLAN_LABEL[usage.plan] || usage.plan

  return (
    <Link
      href="/subscription"
      title={`${used} / ${total} conversations IA utilisées ce mois-ci, plan ${planName}`}
      className="group flex w-full items-center gap-3 rounded-full border border-border/60 bg-muted/30 px-4 py-1.5 transition-colors hover:border-primary/40"
    >
      <Zap className={cn('h-4 w-4 shrink-0', critical ? 'text-rose-500' : low ? 'text-amber-500' : 'text-emerald-500')} />

      {/* Libellé chiffré. En mobile on masque le mot « Crédits IA » mais on garde
          le compteur : la barre s'affichait sinon vide, sans aucun contexte. */}
      <span className="shrink-0 whitespace-nowrap text-xs">
        <span className="hidden text-muted-foreground sm:inline">Crédits IA </span>
        <span className={cn('tabular-nums font-semibold', textColor)}>{used.toLocaleString('fr-FR')}</span>
        <span className="text-muted-foreground"> / {total.toLocaleString('fr-FR')}</span>
      </span>

      {/* Barre de progression colorée */}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Bouton recharger quand il reste peu de crédits */}
      {low ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); rechargeCredits() }}
          disabled={buying}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-3 w-3" /> {buying ? '…' : 'Recharger'}
        </button>
      ) : (
        <span className="hidden shrink-0 text-[11px] text-muted-foreground md:inline">{planName}</span>
      )}
    </Link>
  )
}
