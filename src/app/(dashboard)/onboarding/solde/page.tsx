'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, CheckCircle2, Loader2, ChevronRight, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useSubscription } from '@/hooks/use-subscription'

export default function SoldePage() {
  const searchParams = useSearchParams()
  const soldeOk = searchParams.get('solde') === 'ok'
  const { subscription } = useSubscription()
  const [loading, setLoading] = useState(false)

  const handlePaySolde = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/custom-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: subscription?.onboardingPlan ?? 'scale' }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.booking_url) {
        toast.success('Les 2 acomptes ont déjà été réglés !')
      } else {
        toast.error(data.error || 'Erreur lors de la création du paiement.')
      }
    } catch {
      toast.error('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  if (soldeOk) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Rocket className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Mise en place finalisée !</h1>
            <p className="text-muted-foreground">
              Votre solde a été reçu. L&apos;accès complet à votre plateforme est activé.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Rocket className="h-5 w-5" />
            Accéder à mon tableau de bord
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-2">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Paiement du solde</h1>
          <p className="text-muted-foreground text-sm">
            La configuration de votre plateforme est terminée. Réglez le solde de 750€ pour débloquer l&apos;accès complet.
          </p>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Acompte (déjà réglé)</span>
            <span className="text-foreground font-medium line-through text-muted-foreground">750€</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Solde restant</span>
            <span className="text-foreground font-bold text-lg">750€</span>
          </div>
          <div className="border-t border-border pt-3 flex justify-between items-center text-sm font-semibold">
            <span>Total mise en place</span>
            <span>1 500€</span>
          </div>
        </div>

        <button
          onClick={handlePaySolde}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Payer le solde 750€
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Paiement sécurisé par Stripe
        </p>
      </div>
    </div>
  )
}
