'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, X, Zap, Rocket, Crown, Phone, ArrowRight, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { PlanId } from '@/lib/stripe/plans'

const PLANS = [
  {
    id: 'starter' as PlanId,
    name: 'Starter',
    price: 39,
    tokens: '500 000',
    tokensShort: '500k',
    icon: Zap,
    color: 'text-blue-500',
    borderColor: 'border-blue-500/30',
    bgGradient: 'from-blue-500/5',
    badgeBg: 'bg-blue-500/10 text-blue-600',
    buttonClass: 'bg-blue-500 hover:bg-blue-600',
    features: [
      { text: '1 session WhatsApp', included: true },
      { text: '1 agent IA', included: true },
      { text: 'Conversations & messages', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Tags & liens', included: true },
      { text: 'Statistiques', included: true },
      { text: 'Lifecycle (relances)', included: false },
      { text: 'Campagnes broadcast', included: false },
      { text: 'Support prioritaire', included: false },
    ],
  },
  {
    id: 'pro' as PlanId,
    name: 'Pro',
    price: 79,
    tokens: '1 500 000',
    tokensShort: '1,5M',
    icon: Rocket,
    color: 'text-primary',
    borderColor: 'border-primary/50',
    bgGradient: 'from-primary/5',
    badgeBg: 'bg-primary/10 text-primary',
    buttonClass: '',
    popular: true,
    features: [
      { text: '3 sessions WhatsApp', included: true },
      { text: '3 agents IA', included: true },
      { text: 'Conversations & messages', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Tags & liens', included: true },
      { text: 'Statistiques', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Campagnes broadcast', included: false },
      { text: 'Support prioritaire', included: false },
    ],
  },
  {
    id: 'scale' as PlanId,
    name: 'Scale',
    price: 150,
    tokens: '4 000 000',
    tokensShort: '4M',
    icon: Crown,
    color: 'text-sky-500',
    borderColor: 'border-sky-500/30',
    bgGradient: 'from-sky-500/5',
    badgeBg: 'bg-sky-500/10 text-sky-600',
    buttonClass: 'bg-sky-500 hover:bg-sky-600',
    features: [
      { text: 'Sessions WhatsApp illimitées', included: true },
      { text: 'Agents IA illimités', included: true },
      { text: 'Conversations & messages', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Tags & liens', included: true },
      { text: 'Statistiques', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Campagnes broadcast', included: true },
      { text: 'Support prioritaire', included: true },
    ],
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null)
  const [cgvAccepted, setCgvAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId)
    setCgvAccepted(false)
  }

  const handleConfirm = async () => {
    if (!selectedPlan || !cgvAccepted) return
    setIsLoading(true)

    try {
      // Vérifier si l'utilisateur est connecté
      const sessionRes = await fetch('/api/auth/me').catch(() => null)
      const isLoggedIn = sessionRes?.ok

      if (!isLoggedIn) {
        router.push(`/register?plan=${selectedPlan}`)
        return
      }

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)
      if (data.already_active) {
        router.push('/subscription')
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setIsLoading(false)
    }
  }

  const planDetails = PLANS.find(p => p.id === selectedPlan)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="Autyvia" className="h-8 w-8" />
            <span className="text-lg font-semibold">Autyvia</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Se connecter
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Essai gratuit
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
          <Zap className="h-3.5 w-3.5" />
          14 jours d&apos;essai gratuit — sans carte bancaire
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Automatisez WhatsApp avec l&apos;IA
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Choisissez le plan adapté à votre activité. Pas d&apos;engagement, résiliation à tout moment.
        </p>
      </div>

      {/* Plans */}
      <div className="container mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((plan) => {
            const Icon = plan.icon
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative rounded-2xl border-2 bg-gradient-to-b to-transparent p-6 flex flex-col transition-shadow hover:shadow-lg',
                  plan.bgGradient,
                  plan.borderColor,
                  plan.popular && 'shadow-md'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      Le plus populaire
                    </span>
                  </div>
                )}

                <div className="mb-4 flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', plan.badgeBg.replace('text-', 'bg-').replace('-600', '-500/10').replace('-500', '-500/10'))}>
                    <Icon className={cn('h-5 w-5', plan.color)} />
                  </div>
                  <div>
                    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', plan.badgeBg)}>
                      {plan.name}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold">{plan.price}€</span>
                    <span className="text-muted-foreground mb-1">/mois</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.tokens} tokens IA/mois
                  </p>
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm">
                      {feature.included ? (
                        <Check className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className={feature.included ? 'text-foreground' : 'text-muted-foreground/60'}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn('w-full', plan.buttonClass)}
                  size="lg"
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  Choisir {plan.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>

        {/* Onboarding setup */}
        <div className="mt-10 max-w-5xl mx-auto rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-500/5 to-transparent p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Setup & accompagnement sur mesure</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Configuration complète par notre équipe + suivi personnalisé — <strong>1 500 €</strong> (2× 750 €) + abonnement mensuel
              </p>
            </div>
            <a
              href="https://cal.com/autyvia/appel-decouverte"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-600 hover:bg-sky-500/10 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Réserver un appel découverte
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Note essai */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Tous les plans incluent 14 jours d&apos;essai gratuit avec 200 000 tokens.
          Aucun prélèvement avant la fin de l&apos;essai.
        </p>
      </div>

      {/* Modale CGV */}
      <Dialog open={!!selectedPlan} onOpenChange={(open) => { if (!open) setSelectedPlan(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer votre abonnement</DialogTitle>
            <DialogDescription>
              Avant de procéder au paiement, veuillez lire et accepter nos conditions.
            </DialogDescription>
          </DialogHeader>

          {planDetails && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Plan {planDetails.name}</span>
                <span className="font-bold">{planDetails.price}€/mois</span>
              </div>
              <p className="text-sm text-muted-foreground">{planDetails.tokens} tokens IA/mois</p>
              <p className="text-xs text-muted-foreground mt-2">
                14 jours d&apos;essai gratuit — vous ne serez prélevé qu&apos;à l&apos;issue de la période d&apos;essai.
              </p>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={cgvAccepted}
              onChange={e => setCgvAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
            />
            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              J&apos;ai lu et j&apos;accepte les{' '}
              <Link
                href="/cgv"
                target="_blank"
                className="text-primary underline hover:no-underline"
                onClick={e => e.stopPropagation()}
              >
                Conditions Générales de Vente
              </Link>{' '}
              et les{' '}
              <Link
                href="/cgu"
                target="_blank"
                className="text-primary underline hover:no-underline"
                onClick={e => e.stopPropagation()}
              >
                Conditions Générales d&apos;Utilisation
              </Link>
              .
            </span>
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setSelectedPlan(null)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!cgvAccepted || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirection…
                </>
              ) : (
                'Continuer vers le paiement'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
