'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barre de consommation IA (topbar globale).
 *
 * TOUJOURS une vraie barre qui se remplit avec la conso (tokens), affichée en
 * conversations restantes :
 * - plan à quota (starter/pro) : barre sur la limite du plan
 * - scale « illimité »          : barre sur le plafond fair-use (repère visuel)
 * - free sans IA                : « IA désactivée · Passer au plan payant »
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
    fairUseCap: number | null
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

  // Free (IA off) : invitation à passer au payant (pas de barre).
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

  const { used, limit, remaining, unlimited, percentage, fairUseCap } = usage.conversations

  // Barre de référence :
  // - plan à quota → la limite du plan
  // - scale illimité → le plafond fair-use (repère), sinon un défaut raisonnable
  const refLimit = unlimited ? (fairUseCap ?? 2000) : (limit ?? 0)
  const fillPercent = unlimited
    ? (refLimit > 0 ? Math.min(100, Math.round((used / refLimit) * 100)) : 0)
    : Math.min(100, percentage)

  const left = unlimited ? null : (remaining ?? Math.max(0, (limit ?? 0) - used))
  const barColor = fillPercent >= 90 ? 'bg-red-500' : fillPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'

  const label = unlimited
    ? <><span className="tabular-nums font-medium text-foreground">{used}</span> conversation{used > 1 ? 's' : ''} · Illimité</>
    : <><span className="tabular-nums font-medium text-foreground">{left}</span> conversation{(left ?? 0) > 1 ? 's' : ''} restante{(left ?? 0) > 1 ? 's' : ''}</>

  const titleText = unlimited
    ? `${used} conversations IA ce mois-ci · illimité (fair-use ${refLimit})`
    : `${used} / ${limit} conversations IA utilisées ce mois-ci — ${left} restantes`

  return (
    <Link
      href="/subscription"
      title={titleText}
      className="hidden items-center gap-2.5 rounded-full border border-border/60 bg-muted/30 px-3.5 py-1.5 transition-colors hover:border-primary/40 md:flex"
    >
      <MessageSquare className={cn('h-3.5 w-3.5', fillPercent >= 90 ? 'text-red-500' : 'text-muted-foreground')} />
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  )
}
