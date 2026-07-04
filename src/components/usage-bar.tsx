'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barre de consommation IA (topbar globale).
 *
 * Affiche l'usage du mois en CONVERSATIONS (l'unité commerciale des plans) :
 * - plan à quota  : mini-barre de progression + « 37 / 100 conversations »
 * - scale         : « 214 conversations · Illimité » (fair-use, pas de barre)
 * - free sans IA  : « IA désactivée · Passer au plan payant »
 * Toute la zone est un lien vers /subscription. Rafraîchi toutes les 60 s.
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
  }
}

export function UsageBar() {
  const [usage, setUsage] = useState<Usage | null>(null)

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

  // Free (IA off) : invitation à passer au payant.
  if (!usage.ai_enabled) {
    return (
      <Link
        href="/subscription"
        className="hidden items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex"
      >
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
        <span>IA désactivée</span>
        <span className="font-medium text-primary">Passer au plan payant →</span>
      </Link>
    )
  }

  const { used, limit, remaining, unlimited, percentage } = usage.conversations

  // Scale : illimité fair-use, pas de barre pleine.
  if (unlimited || limit === null) {
    return (
      <Link
        href="/subscription"
        className="hidden items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex"
      >
        <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
        <span className="tabular-nums font-medium text-foreground">{used}</span>
        <span>conversations · Illimité</span>
      </Link>
    )
  }

  // Plans à quota : mini-barre qui SE REMPLIT avec la conso (tokens), texte en
  // « conversations restantes ». Couleurs par seuil : vert <70 %, ambre 70-90 %,
  // rouge ≥90 % (mêmes seuils que la page abonnement).
  const left = remaining ?? Math.max(0, limit - used)
  const barColor = percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <Link
      href="/subscription"
      title={`${used} / ${limit} conversations IA utilisées ce mois-ci — ${left} restantes`}
      className="hidden items-center gap-2.5 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 transition-colors hover:border-primary/40 md:flex"
    >
      <MessageSquare className={cn('h-3.5 w-3.5', percentage >= 90 ? 'text-red-500' : 'text-muted-foreground')} />
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">{left}</span> conversation{left > 1 ? 's' : ''} restante{left > 1 ? 's' : ''}
      </span>
    </Link>
  )
}
