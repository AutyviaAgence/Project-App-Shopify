'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, Loader2, ChevronRight, Rocket, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useSubscription } from '@/hooks/use-subscription'
import { PLAN_PRICES_EUR } from '@/lib/stripe/plans'

export default function SoldePage() {
  const searchParams = useSearchParams()
  const soldeOk = searchParams.get('solde') === 'ok'
  const { subscription } = useSubscription()
  const [loading, setLoading] = useState(false)

  const plan = subscription?.onboardingPlan ?? 'scale'
  const planPrice = PLAN_PRICES_EUR[plan]

  const handlePaySolde = async () => {
    setLoading(true)
    try {
      // Étape 1 : payer le solde setup 445€
      const res = await fetch('/api/stripe/custom-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()

      if (data.booking_url) {
        toast.success('Les 2 acomptes ont déjà été réglés !')
        return
      }

      if (!data.url) {
        toast.error(data.error || 'Erreur lors de la création du paiement.')
        return
      }

      // Rediriger vers le paiement du solde.
      // Après le solde, le webhook activera onboarding_status=active,
      // puis l'utilisateur sera redirigé vers /onboarding/abonnement pour démarrer l'abonnement mensuel.
      window.location.href = data.url
    } catch {
      toast.error('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  // Après le solde payé → proposer de démarrer l'abonnement mensuel
  if (soldeOk) {
    return <AbonnementStep plan={plan} planPrice={planPrice} />
  }

  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-2">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Finalisation de la mise en place</h1>
          <p className="text-muted-foreground text-sm">
            Votre plateforme est prête. Réglez le solde et démarrez votre abonnement mensuel pour obtenir l&apos;accès complet.
          </p>
        </div>

        {/* Récapitulatif */}
        <div className="rounded-xl border border-border p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">À payer aujourd&apos;hui</p>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Acompte setup (déjà réglé)</span>
            <span className="line-through text-muted-foreground">445€</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground font-medium">Solde setup</span>
            <span className="text-foreground font-bold">445€</span>
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Puis immédiatement après :</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground font-medium">1er mois abonnement ({plan.charAt(0).toUpperCase() + plan.slice(1)})</span>
              <span className="text-foreground font-bold">{planPrice}€/mois</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Après le solde, vous serez redirigé vers Stripe pour démarrer votre abonnement mensuel de <strong>{planPrice}€/mois</strong>. Les deux paiements se font à la suite.
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
              Payer le solde 445€
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">Paiement sécurisé par Stripe</p>
      </div>
    </div>
  )
}

function AbonnementStep({ plan, planPrice }: { plan: string; planPrice: number }) {
  const [loading, setLoading] = useState(false)

  const handleStartSubscription = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.already_active) {
        window.location.href = '/dashboard'
      } else {
        toast.error(data.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-2">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Solde reçu !</h1>
          <p className="text-muted-foreground text-sm">
            Il ne reste plus qu&apos;à démarrer votre abonnement mensuel pour activer l&apos;accès complet.
          </p>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium text-foreground">Abonnement {plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
            <span className="font-bold text-foreground">{planPrice}€/mois</span>
          </div>
          <p className="text-xs text-muted-foreground">Renouvellement mensuel automatique — résiliable à tout moment.</p>
        </div>

        <button
          onClick={handleStartSubscription}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Démarrer l&apos;abonnement {planPrice}€/mois
            </>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">Paiement sécurisé par Stripe</p>
      </div>
    </div>
  )
}
