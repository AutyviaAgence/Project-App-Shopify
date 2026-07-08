'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Badge « Plan payant » cliquable → /subscription. Affiché à côté (ou à la
 * place) d'une action réservée aux plans avec IA, sur le plan Gratuit.
 */
export function UpgradeBadge({ className, label = 'Plan payant' }: { className?: string; label?: string }) {
  return (
    <Link
      href="/subscription"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/25',
        className
      )}
      title="Cette fonctionnalité IA nécessite un plan payant — cliquez pour changer de formule"
    >
      <Lock className="h-3 w-3" /> {label}
    </Link>
  )
}
