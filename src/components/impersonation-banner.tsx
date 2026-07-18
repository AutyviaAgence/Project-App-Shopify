'use client'

import { useEffect, useState } from 'react'
import { UserCog, LogOut, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Bannière PERMANENTE affichée quand un admin agit « en tant que » un client.
 *
 * Deux rôles : rappeler en continu qu'on N'EST PAS sur son propre compte (évite
 * les fausses manips), et offrir le retour en un clic. Rouge et fixée en haut :
 * impossible à rater.
 */
export function ImpersonationBanner() {
  const [target, setTarget] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/admin/impersonate/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (active && j?.isImpersonating) setTarget(j.targetEmail || 'un client') })
      .catch(() => {})
    return () => { active = false }
  }, [])

  if (!target) return null

  const leave = async () => {
    setLeaving(true)
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' })
      toast.success('Retour à votre compte admin')
      // Rechargement dur : les Server Components doivent relire l'utilisateur réel.
      window.location.href = '/admin'
    } catch {
      toast.error('Erreur')
      setLeaving(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm font-medium text-white">
      <UserCog className="h-4 w-4 shrink-0" />
      <span className="truncate">
        Vous agissez en tant que <span className="font-semibold">{target}</span> (mode admin)
      </span>
      <button
        onClick={leave}
        disabled={leaving}
        className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/30 disabled:opacity-60"
      >
        {leaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
        Revenir à mon compte
      </button>
    </div>
  )
}
