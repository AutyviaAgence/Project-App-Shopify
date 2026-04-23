'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Circle, Workflow, CreditCard, Settings2, Rocket, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAN_PRICES_EUR } from '@/lib/stripe/plans'
import type { PlanId } from '@/lib/stripe/plans'
import { toast } from 'sonner'

const PLANS: { id: PlanId; name: string; tokens: string; sessions: string; agents: string }[] = [
  { id: 'starter', name: 'Starter', tokens: '500k', sessions: '2', agents: '2' },
  { id: 'pro', name: 'Pro', tokens: '1,5M', sessions: '4', agents: '5' },
  { id: 'scale', name: 'Scale', tokens: '4M', sessions: '10', agents: '10' },
]

const STEPS = [
  { icon: CreditCard, label: 'Acompte 750€', description: 'Réservation de votre mise en place' },
  { icon: Settings2, label: 'Configurateur', description: 'Paramétrez votre agent WhatsApp IA' },
  { icon: Settings2, label: 'Config & tests', description: 'Nous préparons votre plateforme (J14–J30)' },
  { icon: CreditCard, label: 'Solde 750€', description: 'Finalisation avant accès complet' },
  { icon: Rocket, label: 'Accès complet', description: 'Votre plateforme est en ligne' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro')
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
        body: JSON.stringify({ plan: selectedPlan }),
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
          <h1 className="text-3xl font-bold text-foreground">Mise en place de votre plateforme</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Votre plateforme WhatsApp IA est prête à être configurée. Choisissez votre plan et réservez votre mise en place.
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

        {/* Plan selector */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Choisissez votre plan mensuel</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  'relative rounded-xl border-2 p-4 text-left transition-all',
                  selectedPlan === plan.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-base font-bold text-foreground">{plan.name}</span>
                  {selectedPlan === plan.id ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-2xl font-bold text-primary">
                  {PLAN_PRICES_EUR[plan.id]}€
                  <span className="text-sm font-normal text-muted-foreground">/mois</span>
                </p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li>{plan.tokens} tokens IA/mois</li>
                  <li>{plan.sessions} session(s) WhatsApp</li>
                  <li>{plan.agents} agent(s) IA</li>
                </ul>
              </button>
            ))}
          </div>
        </div>

        {/* Setup fee notice */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex gap-3">
          <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">Frais de mise en place : 1 500€ (2×750€)</p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              Un acompte de 750€ est requis aujourd&apos;hui pour démarrer. Le solde de 750€ sera demandé à J+30 avant la remise des accès.
            </p>
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
            , y compris les frais de mise en place non remboursables de 1 500€.
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
              Payer l&apos;acompte 750€ et démarrer
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
