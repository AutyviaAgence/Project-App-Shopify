'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'

/**
 * Badge « Plan payant » cliquable → /subscription. Affiché à côté (ou à la
 * place) d'une action réservée aux plans avec IA, sur le plan Gratuit.
 *
 * ⚠️ Le libellé par défaut est TRADUIT (t('common.paid_plan')). Ne pas remettre
 * « Plan payant » en dur : plusieurs appels (ex. templates/page.tsx) n'ont pas de
 * `label`, un défaut français en dur ressortait alors en anglais.
 */
export function UpgradeBadge({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <Link
      href="/subscription"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/25',
        className
      )}
      title={t('common.paid_plan_tooltip')}
    >
      <Lock className="h-3 w-3" /> {label ?? t('common.paid_plan')}
    </Link>
  )
}
