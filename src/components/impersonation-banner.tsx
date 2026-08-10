'use client'

import { useEffect, useState } from 'react'
import { UserCog, LogOut, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'

/**
 * Bannière PERMANENTE affichée quand un admin agit « en tant que » un client.
 *
 * Deux rôles : rappeler en continu qu'on N'EST PAS sur son propre compte (évite
 * les fausses manips), et offrir le retour en un clic. Rouge et fixée en haut :
 * impossible à rater.
 */
export function ImpersonationBanner() {
  const { t } = useTranslation()
  const [target, setTarget] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/admin/impersonate/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (active && j?.isImpersonating) setTarget(j.targetEmail || t('ui3.a_client')) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  if (!target) return null

  const leave = async () => {
    setLeaving(true)
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' })
      toast.success(t('ui3.back_to_admin'))
      // Rechargement dur : les Server Components doivent relire l'utilisateur réel.
      window.location.href = '/admin'
    } catch {
      toast.error(t('ui3.error'))
      setLeaving(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm font-medium text-white">
      <UserCog className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {t('ui3.acting_as', { name: target })}
      </span>
      <button
        onClick={leave}
        disabled={leaving}
        className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/30 disabled:opacity-60"
      >
        {leaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
        {t('ui3.return_to_account')}
      </button>
    </div>
  )
}
