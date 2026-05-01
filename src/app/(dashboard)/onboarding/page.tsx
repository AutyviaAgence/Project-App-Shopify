'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Workflow, CreditCard, Settings2, Rocket, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const STEPS = [
  { icon: CreditCard, label: 'Acompte 445€', description: 'Réservation de votre mise en place (J0)' },
  { icon: Settings2, label: 'Configurateur', description: 'Paramétrez votre agent WhatsApp IA (J0–J14)' },
  { icon: Settings2, label: 'Config & tests', description: 'Notre équipe prépare votre plateforme (J14–J30)' },
  { icon: CreditCard, label: 'Solde 445€ + 1er mois', description: 'Solde setup + démarrage abonnement mensuel (J30)' },
  { icon: Rocket, label: 'Accès complet', description: 'Votre plateforme est en ligne, abonnement actif' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [cgvAccepted, setCgvAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    if (!cgvAccepted) {
      toast.error('Veuillez accepter les CGV pour continuer.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/stripe/custom-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Erreur lors de la création du paiement.')
      }
    } catch {
      toast.error('Erreur réseau. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Audit & mise en place sur mesure</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Notre équipe configure votre plateforme de A à Z. Choisissez votre plan mensuel et réservez votre audit.
          </p>
        </div>

        {/* Timeline */}
        <div className="bg-muted/40 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Déroulement</h2>
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-px bg-border" />
            <div className="space-y-5">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-4 pl-1">
                  <div className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                    i === 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                  )}>
                    <step.icon className="h-4 w-4" />
                  </div>
                  <div className="pt-0.5">
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Setup fee notice */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 space-y-3">
          <div className="flex gap-3">
            <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">Frais d&apos;audit &amp; mise en place : 990€ (2×445€)</p>
              <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                Un acompte de 445€ est requis aujourd&apos;hui. À J+30, vous réglez le solde de 445€ et démarrez votre abonnement mensuel selon le plan choisi.
              </p>
            </div>
          </div>
          <div className="ml-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <div className="flex justify-between"><span>J0 — Acompte setup</span><span className="font-semibold">445€</span></div>
            <div className="flex justify-between"><span>J30 — Solde setup</span><span className="font-semibold">445€</span></div>
            <div className="flex justify-between text-muted-foreground"><span>J30 — 1er mois abonnement (selon plan choisi)</span><span>selon plan</span></div>
            <div className="border-t border-amber-300 dark:border-amber-700 pt-1 flex justify-between font-semibold">
              <span>Total frais audit</span>
              <span>990€</span>
            </div>
          </div>
        </div>

        {/* CGV checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={cgvAccepted}
            onChange={(e) => setCgvAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="text-sm text-muted-foreground">
            J&apos;ai lu et j&apos;accepte les{' '}
            <Link href="/cgv" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
              Conditions Générales de Vente
            </Link>{' '}
            et les{' '}
            <Link href="/cgu" target="_blank" className="text-primary underline underline-offset-2 hover:text-primary/80">
              CGU
            </Link>
            , y compris les frais d&apos;audit de 990€ remboursables selon les conditions des CGU.
          </span>
        </label>

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={loading || !cgvAccepted}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all',
            cgvAccepted
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <>
              Payer l&apos;acompte 445€ et démarrer
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Paiement sécurisé par Stripe — Vous serez redirigé vers la page de paiement.
        </p>
      </div>
    </div>
  )
}
