'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Sparkles } from 'lucide-react'

/**
 * Barre de consommation IA (topbar globale), PLEINE LARGEUR et responsive.
 *
 * Barre bleue à dégradé qui se remplit avec la conso (tokens), affichée en
 * conversations restantes :
 * - plan à quota (starter/pro) : barre sur la limite du plan
 * - scale « illimité »          : barre sur le plafond fair-use (repère)
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
        className="flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span className="hidden sm:inline">IA désactivée</span>
        <span className="font-medium text-primary">Passer au plan payant →</span>
      </Link>
    )
  }

  const { used, limit, remaining, unlimited, percentage, fairUseCap } = usage.conversations

  // Barre de référence :
  // - plan à quota → la limite du plan
  // - scale illimité → le plafond fair-use (repère), sinon défaut raisonnable
  const refLimit = unlimited ? (fairUseCap ?? 2000) : (limit ?? 0)
  const fillPercent = unlimited
    ? (refLimit > 0 ? Math.min(100, Math.round((used / refLimit) * 100)) : 0)
    : Math.min(100, percentage)

  const left = unlimited ? null : (remaining ?? Math.max(0, (limit ?? 0) - used))

  const label = unlimited
    ? <><span className="tabular-nums font-semibold text-foreground">{used}</span> conv. · Illimité</>
    : <><span className="tabular-nums font-semibold text-foreground">{left}</span> conversation{(left ?? 0) > 1 ? 's' : ''} restante{(left ?? 0) > 1 ? 's' : ''}</>

  const titleText = unlimited
    ? `${used} conversations IA ce mois-ci · illimité (fair-use ${refLimit})`
    : `${used} / ${limit} conversations IA utilisées ce mois-ci — ${left} restantes`

  return (
    <Link
      href="/subscription"
      title={titleText}
      className="group flex w-full items-center gap-3 rounded-full border border-border/60 bg-muted/30 px-4 py-1.5 transition-colors hover:border-primary/40"
    >
      <MessageSquare className="h-4 w-4 shrink-0 text-blue-500" />

      {/* Barre pleine largeur, bleue à dégradé */}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 transition-all duration-500"
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {/* Libellé — masqué sur très petit écran, la barre reste visible */}
      <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
        {label}
      </span>
    </Link>
  )
}
