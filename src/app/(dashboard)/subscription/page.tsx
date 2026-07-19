'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { track } from '@/lib/posthog/events'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Check,
  X,
  CreditCard,
  Loader2,
  Calendar,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Cpu,
  Ban,
  Rocket,
  Crown,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import Link from 'next/link'
import type { PlanId } from '@/lib/stripe/plans'
import { annualPrice, ANNUAL_DISCOUNT } from '@/lib/plans'

// Grille commerciale (source de vérité : @/lib/plans). Les limites IA sont
// affichées en CONVERSATIONS estimées ; les tokens restent un backstop interne.
// Plus de plan Gratuit : l'app est 100 % payante (7 jours d'essai).
const PLANS = [
  {
    id: 'starter' as PlanId,
    name: 'Starter',
    price: 49,
    limitDesc: '550 conversations IA / mois',
    icon: Zap,
    color: 'text-blue-500',
    borderColor: 'border-blue-500/30',
    bgGradient: 'from-blue-500/5',
    badgeBg: 'bg-blue-500/10 text-blue-600',
    buttonClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    features: [
      { text: '1 numéro WhatsApp', included: true },
      { text: '1 agent IA', included: true },
      { text: 'Base de connaissances', included: true },
      { text: 'Automatisations (panier abandonné…)', included: true },
      { text: 'Multi-agents IA', included: false },
      { text: 'Campagnes', included: false },
    ],
  },
  {
    id: 'pro' as PlanId,
    name: 'Pro',
    price: 149,
    limitDesc: '1 800 conversations IA / mois',
    icon: Rocket,
    color: 'text-primary',
    borderColor: 'border-primary/50',
    bgGradient: 'from-primary/5',
    badgeBg: 'bg-primary/10 text-primary',
    buttonClass: '',
    popular: true,
    features: [
      { text: '1 numéro WhatsApp', included: true },
      { text: '5 agents IA', included: true },
      { text: 'Actions Shopify (annulation, remboursement…)', included: true },
      { text: 'Automatisations + Campagnes', included: true },
      { text: 'Lifecycle (relances)', included: true },
      { text: 'Analyse lifecycle IA', included: true },
    ],
  },
  {
    id: 'scale' as PlanId,
    name: 'Scale',
    price: 349,
    limitDesc: '4 500 conversations IA / mois',
    icon: Crown,
    color: 'text-sky-500',
    borderColor: 'border-sky-500/30',
    bgGradient: 'from-sky-500/5',
    badgeBg: 'bg-sky-500/10 text-sky-600',
    buttonClass: 'bg-sky-500 hover:bg-sky-600 text-white',
    features: [
      { text: '4 500 conversations IA / mois', included: true },
      { text: 'Crédits supplémentaires disponibles', included: true },
      { text: 'GPT-4o prioritaire (demandes sensibles)', included: true },
      { text: 'Agents IA illimités', included: true },
      { text: 'Actions Shopify avancées', included: true },
      { text: 'Support prioritaire', included: true },
    ],
  },
]

/**
 * Contenu complet de l'abonnement (plan, crédits IA, recharge, changement de
 * plan, annulation).
 *
 * Exporté pour être rendu DANS l'onglet Paramètres › Abonnement : les Paramètres
 * sont désormais la seule destination, et /subscription y redirige. Sans cet
 * export, il aurait fallu dupliquer 900 lignes — ou laisser deux endroits
 * différents pour la même chose, ce qui était justement le problème.
 */
export function SubscriptionContent() {
  const { t, locale } = useTranslation()
  const tenant = useTenant()
  const searchParams = useSearchParams()
  const { subscription, loading, refetch } = useSubscription()
  // ⚠️ CONFORMITÉ SHOPIFY : marchand facturé par Shopify → tous les chemins Stripe
  // (checkout, changement de plan, packs, portail) sont masqués/redirigés.
  const shopifyBilled = subscription?.shopifyBilled === true
  const shopDomain = subscription?.shopDomain ?? null
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null)
  // Intervalle de facturation choisi (mensuel par défaut, annuel = -20 %).
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly')
  const [cgvAccepted, setCgvAccepted] = useState(false)
  // Code promo : replié par défaut. Un champ toujours visible pousse le marchand
  // à en chercher un, et à hésiter s'il n'en a pas.
  const [showPromo, setShowPromo] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [buyingCredits, setBuyingCredits] = useState(false)
  // Crédits IA = conversations IA du mois (compteur réel).
  const [aiCredits, setAiCredits] = useState<{
    used: number
    limit: number | null
    percentage: number
    /** Quota du plan seul (remis à zéro chaque mois). null = illimité. */
    planLimit?: number | null
    /** Recharges achetées (ne périment pas). */
    extra?: number
    planUsed?: number
    extraUsed?: number
    extraRemaining?: number | null
  } | null>(null)

  useEffect(() => {
    fetch('/api/subscription/usage')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (json?.data?.conversations) setAiCredits(json.data.conversations) })
      .catch(() => {})
  }, [])

  // Passait par Stripe, qui refuse les marchands Shopify (403) — c'est-à-dire
  // tous, puisque l'onboarding impose une boutique. Désormais sur la Billing API.
  const rechargeAiCredits = async () => {
    setBuyingCredits(true)
    try {
      const res = await fetch('/api/shopify/billing/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ `shop` est OBLIGATOIRE hors iframe Shopify. La route lit
        // `authed.shop || body.shop` : en embedded le domaine vient du session
        // token, mais depuis le dashboard web il n'y en a pas → « Paramètre shop
        // invalide ». On l'envoie donc explicitement, comme pour l'abonnement.
        body: JSON.stringify({ pack: 'ai_credits', shop: shopDomain }),
      })
      const json = await res.json()
      if (!res.ok || !json?.data?.confirmationUrl) {
        throw new Error(json?.error || 'Achat impossible')
      }
      window.location.href = json.data.confirmationUrl
    } catch (e) {
      // ⚠️ On REMONTE l'erreur du serveur au lieu d'un message générique : le
      // « Impossible de lancer l'achat » masquait la vraie cause (jeton Shopify
      // expiré, refus de Shopify, table manquante…) et rendait le diagnostic
      // impossible côté marchand comme côté support.
      toast.error(e instanceof Error ? e.message : 'Impossible de lancer l’achat de crédits.')
      setBuyingCredits(false)
    }
  }

  useEffect(() => {
    const p = searchParams.get('plan')
    if (p === 'starter' || p === 'pro' || p === 'scale') {
      setSelectedPlan(p)
    }
  }, [searchParams])

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      // Retour post-paiement : la réconciliation du plan est faite par le callback
      // Billing Shopify. Ici on rafraîchit juste l'affichage. (L'ancien appel à
      // /api/subscription/sync, côté Stripe, a été retiré.)
      track('subscription_started')
      refetch().then(() => toast.success(t('subscription.payment_success')))
    } else if (searchParams.get('cancelled') === 'true') {
      toast.info(t('subscription.payment_cancelled'))
    } else if (searchParams.get('tokens_success') === 'true') {
      refetch().then(() => toast.success(t('subscription.tokens_added')))
    }
  }, [searchParams, refetch, t])

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId)
    setCgvAccepted(false)
  }

  const handleSubscribe = async () => {
    if (!selectedPlan || !cgvAccepted) return
    setIsProcessing(true)
    try {
      // FACTURATION 100 % SHOPIFY : tout abonnement (souscription, changement de
      // plan, changement d'intervalle) passe par la Billing API. Stripe a été
      // retiré. `createAppSubscription` gère upgrade/downgrade côté serveur
      // (APPLY_IMMEDIATELY / APPLY_ON_NEXT_BILLING_CYCLE).
      if (!shopifyBilled || !shopDomain) {
        throw new Error("Aucune boutique Shopify liée. Ouvrez l'application depuis votre admin Shopify pour vous abonner.")
      }
      const res = await fetch('/api/shopify/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain,
          plan: selectedPlan,
          billing: billingInterval,
          // N'envoyer la clé que si un code est saisi : la route refuse un code
          // vide, et un `promo_code: ''` la ferait échouer inutilement.
          ...(promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
        }),
      })
      const json = await res.json()
      const confirmationUrl = json?.data?.confirmationUrl
      if (!res.ok || !confirmationUrl) throw new Error(json.error || 'Erreur de facturation Shopify')
      window.location.href = confirmationUrl
    } catch (error) {
      console.error('[Subscription] Error:', error)
      toast.error(error instanceof Error ? error.message : t('subscription.payment_error'))
      setIsProcessing(false)
    }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      // Annulation via la Billing API Shopify (App Store requirement 1.2.3 : le
      // marchand doit pouvoir annuler SANS contacter le support). Facturation
      // 100 % Shopify — plus de chemin Stripe.
      const res = await fetch('/api/shopify/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('subscription.cancel_success'))
      await refetch()
    } catch {
      toast.error(t('subscription.cancel_error'))
    } finally {
      setIsCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const formatDate = (date: Date | null) => {
    if (!date) return '-'
    return date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Sans abonnement payant explicite, le compte est sur le plan GRATUIT (0€) :
  // c'est un vrai plan (pas « aucun plan »), avec accès à la plateforme (sans IA).
  const currentPlan = (subscription?.plan ?? 'free') as PlanId
  const isFree = currentPlan === 'free'
  // Accès : payant actif/trial OU plan gratuit (le Gratuit n'est jamais « suspendu »).
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing' || isFree
  const isCancelled = subscription?.status === 'canceled'
  // For cancelled subscriptions, ignore pending_plan — user needs to re-subscribe fresh
  const pendingPlan = !isCancelled ? (subscription?.pendingPlan ?? null) : null
  const planDetails = PLANS.find(p => p.id === selectedPlan)
  // A-t-il DÉJÀ un abonnement payant actif ? → c'est un CHANGEMENT de plan, pas
  // une première souscription. (Remplace l'ancien test `stripeSubscriptionId`,
  // toujours null en facturation 100 % Shopify.)
  const hasActivePlan = isActive && !isCancelled && !isFree && !!currentPlan
  /** Le marchand est-il facturé à l'ANNÉE ? (pilote tous les montants affichés) */
  const isAnnualPlan = subscription?.billingInterval === 'annual'

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('subscription.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subscription.description', { appName: tenant.appName })}
        </p>
      </div>

      {/* Marchand Shopify : la facturation passe par Shopify (Billing API), pas
          par Stripe — on l'explique pour éviter la confusion (aucun moyen de
          paiement à saisir ici, la facture arrive avec celle de Shopify). */}
      {shopifyBilled && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Facturation gérée par Shopify</p>
              <p className="mt-0.5 text-muted-foreground">
                Votre abonnement Xeyo est facturé <span className="font-medium text-foreground">avec votre facture Shopify</span>
                {shopDomain ? ` (${shopDomain})` : ''}. Vous approuvez le changement de plan directement dans Shopify —
                aucun moyen de paiement à saisir ici.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statut abonnement */}
      {subscription && (
        <Card className={cn(
          'mb-8 border-2',
          subscription.status === 'active' && 'border-green-500/30',
          subscription.status === 'trialing' && 'border-amber-500/30',
          // Abonnement lancé mais jamais approuvé chez Shopify.
          subscription.status === 'pending' && 'border-amber-500/30',
          subscription.status === 'canceled' && 'border-orange-500/30',
          // Impayé : Shopify a gelé l'abonnement.
          subscription.status === 'frozen' && 'border-red-500/30',
          subscription.status === 'past_due' && 'border-red-500/30',
        )}>
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-5">

              {/* Ligne 1 : plan + badge statut */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const planInfo = PLANS.find(p => p.id === currentPlan)
                    const Icon = planInfo?.icon ?? Cpu
                    return <Icon className={cn('h-6 w-6', planInfo?.color ?? 'text-muted-foreground')} />
                  })()}
                  <div>
                    <p className="text-lg font-bold">
                      Plan {PLANS.find(p => p.id === currentPlan)?.name ?? 'Aucun plan'}
                      {pendingPlan && (
                        <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                          → {PLANS.find(p => p.id === pendingPlan)?.name ?? pendingPlan} au prochain renouvellement
                        </span>
                      )}
                    </p>
                    {/* Prix affiché selon l'intervalle RÉELLEMENT facturé. */}
                    <p className="text-sm text-muted-foreground">
                      {currentPlan && PLANS.find(p => p.id === currentPlan)
                        ? isAnnualPlan
                          ? `${annualPrice(currentPlan).toLocaleString('fr-FR')}€/an`
                          : `${PLANS.find(p => p.id === currentPlan)?.price}€/mois`
                        : '—'}
                      {isAnnualPlan && <span className="ml-1 text-emerald-600">· 2 mois offerts</span>}
                      {pendingPlan && PLANS.find(p => p.id === pendingPlan) && (
                        <span className="ml-1">
                          → {isAnnualPlan
                            ? `${annualPrice(pendingPlan).toLocaleString('fr-FR')}€/an`
                            : `${PLANS.find(p => p.id === pendingPlan)?.price}€/mois`} après renouvellement
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {/* ⚠️ Le badge ne gérait que 4 statuts (active, trialing, canceled,
                    past_due). Les statuts Shopify `pending` (abonnement lancé mais
                    jamais approuvé) et `frozen` (impayé) n'en faisaient pas partie :
                    le badge s'affichait alors VIDE — d'où la pastille bleue muette,
                    sans le moindre libellé, en haut à droite de la carte. */}
                <Badge className={cn(
                  'self-start px-3 py-1 text-sm sm:self-auto',
                  subscription.status === 'active' && 'bg-green-500 hover:bg-green-600',
                  subscription.status === 'trialing' && 'bg-amber-500 hover:bg-amber-600',
                  subscription.status === 'pending' && 'bg-amber-500 hover:bg-amber-600',
                  subscription.status === 'canceled' && 'bg-orange-500 hover:bg-orange-600',
                  subscription.status === 'frozen' && 'bg-red-500 hover:bg-red-600',
                  subscription.status === 'past_due' && 'bg-red-500 hover:bg-red-600',
                  !['active', 'trialing', 'pending', 'canceled', 'frozen', 'past_due'].includes(
                    subscription.status || ''
                  ) && 'bg-muted text-muted-foreground hover:bg-muted',
                )}>
                  {subscription.status === 'active' && 'Actif'}
                  {subscription.status === 'trialing' && 'Période d’essai'}
                  {subscription.status === 'pending' && 'En attente d’approbation'}
                  {subscription.status === 'canceled' && 'Annulé'}
                  {subscription.status === 'frozen' && 'Impayé'}
                  {subscription.status === 'past_due' && 'Expiré'}
                  {!['active', 'trialing', 'pending', 'canceled', 'frozen', 'past_due'].includes(
                    subscription.status || ''
                  ) && 'Aucun abonnement'}
                </Badge>
              </div>

              {/* Ligne 2 : infos clés */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Prochain prélèvement / fin de période */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {subscription.status === 'canceled'
                      ? 'Accès jusqu\'au'
                      : subscription.status === 'trialing'
                      ? 'Fin d\'essai'
                      : 'Prochain renouvellement'}
                  </p>
                  <p className="text-sm font-semibold">
                    {subscription.status === 'active' && subscription.subscriptionEndsAt
                      ? formatDate(subscription.subscriptionEndsAt)
                      : subscription.status === 'trialing' && subscription.trialEndsAt
                      ? formatDate(subscription.trialEndsAt)
                      : subscription.status === 'canceled' && subscription.subscriptionEndsAt
                      ? formatDate(subscription.subscriptionEndsAt)
                      : '—'}
                  </p>
                  {subscription.daysRemaining !== null && subscription.daysRemaining > 0 && (
                    <p className="text-xs text-muted-foreground/70">{subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''}</p>
                  )}
                </div>

                {/* Montant prochain prélèvement */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {subscription.status === 'canceled' || subscription.status === 'past_due'
                      ? 'Prochain paiement'
                      : 'Montant prélevé'}
                  </p>
                  {/* ⚠️ Le montant DOIT suivre l'intervalle réellement facturé :
                      un marchand en annuel voyait « 149 € · par mois » alors qu'il
                      est prélevé de 1 430 € par an. */}
                  <p className="text-sm font-semibold">
                    {subscription.status === 'canceled' || subscription.status === 'past_due'
                      ? '—'
                      : (() => {
                          const shown = (pendingPlan || currentPlan) as PlanId
                          if (!PLANS.find(p => p.id === shown)) return '—'
                          return isAnnualPlan
                            ? `${annualPrice(shown).toLocaleString('fr-FR')}€`
                            : `${PLANS.find(p => p.id === shown)?.price}€`
                        })()}
                  </p>
                  {(subscription.status === 'active' || subscription.status === 'trialing') && !pendingPlan && (
                    <p className="text-xs text-muted-foreground/70">
                      {isAnnualPlan ? 'par an, hors taxes' : 'par mois, hors taxes'}
                    </p>
                  )}
                  {pendingPlan && subscription.status !== 'canceled' && subscription.status !== 'past_due' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">nouveau montant</p>
                  )}
                  {(subscription.status === 'canceled' || subscription.status === 'past_due') && (
                    <p className="text-xs text-muted-foreground/70">aucun renouvellement</p>
                  )}
                </div>

                {/* Accès */}
                <div className={cn(
                  'rounded-lg border p-3 space-y-0.5 col-span-2 sm:col-span-1',
                  isActive ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20',
                )}>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {isActive
                      ? <CheckCircle className="h-3 w-3 text-green-500" />
                      : <XCircle className="h-3 w-3 text-red-500" />}
                    Accès plateforme
                  </p>
                  <p className={cn('text-sm font-semibold', isActive ? 'text-green-600' : 'text-red-600')}>
                    {isActive ? 'Actif' : 'Suspendu'}
                  </p>
                  {subscription.status === 'canceled' && isActive && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">jusqu&apos;à fin de période</p>
                  )}
                  {isFree && (
                    <p className="text-xs text-muted-foreground/70">Sans IA, passez à un plan payant pour l&apos;activer</p>
                  )}
                  {!isActive && !isFree && (
                    <p className="text-xs text-red-500/70">Réabonnez-vous pour accéder</p>
                  )}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      )}


      {/* Crédits IA (conversations), visible pour onboarding, active et skipped */}
      {subscription && (!!currentPlan) && aiCredits && aiCredits.limit !== null && (
        <Card className="mb-8" data-tour="ai-credits">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="font-semibold">Crédits IA (conversations)</span>
              </div>
              {/* Recharge de conversations IA via la Billing API Shopify
                  (appPurchaseOneTimeCreate — achat ponctuel conforme App Store).
                  rechargeAiCredits() appelle /api/shopify/billing/purchase : le
                  bouton s'affiche donc POUR les marchands Shopify (la condition
                  était inversée : il était masqué à ceux qui pouvaient l'utiliser). */}
              {shopifyBilled && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={rechargeAiCredits}
                  disabled={buyingCredits}
                >
                  <Zap className="mr-1 h-3 w-3" />
                  {buyingCredits ? 'Redirection…' : 'Recharger +500 conversations (45€)'}
                </Button>
              )}
            </div>
            {/* Définition exacte, alignée sur countAiConversationsThisMonth() :
                « conversations distinctes avec au moins un message sent_by=ai_agent ». */}
            <p className="mt-2 text-sm text-muted-foreground">
              Un <span className="font-medium text-foreground">crédit</span> = une{' '}
              <span className="font-medium text-foreground">conversation IA</span> : une discussion
              dans laquelle votre agent a répondu au moins une fois. Peu importe le nombre de
              messages échangés ensuite, toute la conversation ne consomme qu’un seul crédit.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Ne consomment <span className="font-medium text-foreground">rien</span> : vos réponses manuelles, les automatisations et les modèles envoyés sans IA.</li>
              <li>• Le quota <span className="font-medium text-foreground">inclus dans votre plan</span> repart de zéro à chaque renouvellement mensuel.</li>
              <li>• Les <span className="font-medium text-foreground">recharges</span> achetées prennent le relais une fois ce quota épuisé, et <span className="font-medium text-foreground">ne périment pas</span>.</li>
            </ul>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ── DEUX COMPTEURS DISTINCTS ────────────────────────────────────
                Le quota du plan et les recharges n'ont PAS la même nature : le
                premier se remet à zéro chaque mois, les secondes ne périment
                jamais. Les fondre dans une seule barre (« 1 / 2 800 ») laissait
                croire que le plan incluait tout, et contredisait la mention
                « remis à zéro chaque mois ». On les sépare donc.
                Le plan est consommé EN PREMIER, les recharges ensuite. */}
            {(() => {
              const planLimit = aiCredits.planLimit ?? aiCredits.limit
              const planUsed = aiCredits.planUsed ?? aiCredits.used
              const extra = aiCredits.extra ?? 0
              const extraUsed = aiCredits.extraUsed ?? 0
              const extraLeft = aiCredits.extraRemaining ?? Math.max(0, extra - extraUsed)
              const planPct = planLimit && planLimit > 0
                ? Math.min(100, Math.round((planUsed / planLimit) * 100))
                : 0
              const extraPct = extra > 0 ? Math.min(100, Math.round((extraUsed / extra) * 100)) : 0
              return (
                <div className="space-y-4">
                  {/* 1. Quota du plan (mensuel) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{planUsed.toLocaleString('fr-FR')}</span>
                        {' / '}{(planLimit ?? 0).toLocaleString('fr-FR')} <span className="font-medium text-foreground">inclus dans votre plan</span>
                      </span>
                      <span className={cn(
                        'font-medium',
                        planPct < 80 && 'text-green-600',
                        planPct >= 80 && planPct < 95 && 'text-amber-600',
                        planPct >= 95 && 'text-red-600',
                      )}>
                        {planPct}%
                      </span>
                    </div>
                    <Progress
                      value={planPct}
                      className={cn(
                        'h-2.5',
                        planPct >= 95 && '[&>div]:bg-red-500',
                        planPct >= 80 && planPct < 95 && '[&>div]:bg-amber-500',
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      {Math.max(0, (planLimit ?? 0) - planUsed).toLocaleString('fr-FR')} restantes · remis à zéro le mois prochain
                    </p>
                  </div>

                  {/* 2. Recharges achetées — affichées SEULEMENT si le marchand
                         en a. Sinon on propose la recharge (encart ci-dessous). */}
                  {extra > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{extraUsed.toLocaleString('fr-FR')}</span>
                          {' / '}{extra.toLocaleString('fr-FR')} <span className="font-medium text-foreground">de recharge</span>
                        </span>
                        <span className="font-medium text-amber-600">{extraPct}%</span>
                      </div>
                      <Progress value={extraPct} className="h-2 [&>div]:bg-amber-500" />
                      <p className="text-xs text-muted-foreground">
                        {extraLeft.toLocaleString('fr-FR')} restantes · <span className="font-medium text-foreground">ne périment pas</span>
                        {planLimit !== null && planUsed < planLimit && ' (utilisées après le quota du plan)'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Aucune recharge en réserve.</span>{' '}
                        Une recharge ajoute 500 conversations (45 €) qui <span className="font-medium text-foreground">ne périment pas</span> :
                        elles prennent le relais une fois le quota du plan épuisé.
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}

            {aiCredits.percentage >= 80 && (
              <div className={cn(
                'rounded-lg p-3 text-xs',
                aiCredits.percentage >= 100 ? 'bg-red-500/10 text-red-700 border border-red-500/20' :
                'bg-amber-500/10 text-amber-700 border border-amber-500/20',
              )}>
                {aiCredits.percentage >= 100
                  ? "Crédits IA épuisés, l'IA est en pause. Rechargez pour continuer à répondre automatiquement."
                  : "Vous avez consommé plus de 80% de vos crédits IA. Pensez à recharger bientôt."}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions abonnement actif */}
      {isActive && (!!currentPlan) && (
        <Card className="mb-8">
          <CardContent className="pt-6 space-y-4">
            {/* Facturation 100 % Shopify : les factures et le moyen de paiement se
                gèrent dans l'admin Shopify. On y renvoie (le portail Stripe a été
                retiré). */}
            {shopifyBilled ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Factures et moyen de paiement</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Votre abonnement Xeyo est facturé avec votre facture Shopify. Vos factures et
                      votre moyen de paiement se gèrent dans votre admin Shopify.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      const domain = subscription?.shopDomain
                      if (!domain) return
                      window.open(`https://${domain}/admin/settings/billing`, '_blank', 'noopener')
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Ouvrir Shopify
                  </Button>
                </div>
                <div className="border-t" />
              </>
            ) : null}

            {/* Résiliation via la Billing API Shopify (requirement 1.2.3 : annuler
                sans contacter le support). Facturation 100 % Shopify. */}
            {shopifyBilled && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Zone de danger</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {subscription?.status === 'trialing'
                      ? 'L\'annulation est immédiate. Vous ne serez pas débité.'
                      : 'L\'accès reste actif jusqu\'à la fin de la période en cours. Aucun remboursement au prorata.'}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button data-tour="cancel-subscription" variant="outline" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive">
                      <Ban className="mr-2 h-4 w-4" />
                      {t('subscription.cancel_subscription')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('subscription.cancel_confirm_title')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {subscription?.status === 'trialing'
                          ? 'Votre essai gratuit sera annulé immédiatement. Vous ne serez jamais débité.'
                          : t('subscription.cancel_confirm_desc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('subscription.cancel_keep')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        disabled={isCancelling}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                        {t('subscription.cancel_confirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <h2 className="text-xl font-semibold mb-4">
        {isCancelled
          ? 'Se réabonner'
          : hasActivePlan
          ? 'Changer de plan'
          : 'Plans disponibles'}
      </h2>
      {/* Sélecteur d'intervalle : mensuel vs annuel (-20 %). */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setBillingInterval('monthly')}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            billingInterval === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Mensuel
        </button>
        <button
          type="button"
          onClick={() => setBillingInterval('annual')}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            billingInterval === 'annual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Annuel
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            billingInterval === 'annual' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-emerald-500/15 text-emerald-600'
          )}>
            −{Math.round(ANNUAL_DISCOUNT * 100)}%
          </span>
        </button>
      </div>

      {/* Ancre pour l'assistant d'aide : « comment changer de plan ? » l'amène ici
          et surligne la grille des plans. */}
      <div data-tour="plans-grid" className="grid md:grid-cols-3 gap-5 mb-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = isActive && (!!currentPlan) && currentPlan === plan.id && !pendingPlan
          const isPending = pendingPlan === plan.id
          // Prix affiché selon l'intervalle : mensuel, ou annuel « par mois » (-20 %).
          const displayPrice = billingInterval === 'annual'
            ? Math.round(annualPrice(plan.id) / 12)
            : plan.price
          return (
            <Card
              key={plan.id}
              className={cn(
                'relative border-2 bg-gradient-to-b to-transparent flex flex-col transition-shadow',
                plan.bgGradient,
                isCurrent ? 'border-green-500/60 shadow-md' : isPending ? 'border-amber-500/60 shadow-md' : plan.borderColor,
                plan.popular && !isCurrent && !isPending && 'shadow-sm',
              )}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white">
                    Plan actuel
                  </span>
                </div>
              )}
              {isPending && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                    Prochain plan
                  </span>
                </div>
              )}
              {plan.popular && !isCurrent && !isPending && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Populaire
                  </span>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('h-5 w-5', plan.color)} />
                  <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', plan.badgeBg)}>
                    {plan.name}
                  </span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold">{displayPrice}€</span>
                  <span className="text-muted-foreground mb-0.5 text-sm">/mois</span>
                </div>
                {billingInterval === 'annual' && (
                  <p className="text-[11px] font-medium text-emerald-600">
                    soit {annualPrice(plan.id)}€/an · 2 mois offerts
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{plan.limitDesc}</p>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      {f.included
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                      <span className={f.included ? '' : 'text-muted-foreground/60'}>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Button className="w-full" disabled variant="outline">
                    <Check className="mr-2 h-4 w-4" />
                    Plan actuel
                  </Button>
                ) : isPending ? (
                  <Button className="w-full" disabled variant="outline">
                    <Clock className="mr-2 h-4 w-4 text-amber-500" />
                    Prochain renouvellement
                  </Button>
                ) : (
                  <Button
                    className={cn('w-full', plan.buttonClass)}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    Choisir {plan.name}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        <Clock className="inline-block h-4 w-4 mr-1" />
        {t('subscription.stripe_note')}
      </p>

      {/* Modale confirmation plan */}
      {/* À la fermeture, on remet le champ promo à zéro : sinon un code refusé
          resterait saisi à la prochaine ouverture et échouerait à nouveau. */}
      <Dialog
        open={!!selectedPlan}
        onOpenChange={(open) => {
          if (!open) { setSelectedPlan(null); setPromoCode(''); setShowPromo(false) }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasActivePlan ? 'Changer de plan' : isCancelled ? 'Se réabonner' : 'Confirmer votre abonnement'}
            </DialogTitle>
            <DialogDescription>
              {hasActivePlan
                ? `Le changement prendra effet à votre prochain renouvellement${subscription?.subscriptionEndsAt ? ` le ${subscription.subscriptionEndsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Votre plan actuel reste actif jusqu\'à cette date.`
                : isCancelled
                ? 'Votre abonnement a été annulé. Choisissez un plan pour vous réabonner.'
                : 'Lisez et acceptez nos conditions avant de procéder au paiement.'}
            </DialogDescription>
          </DialogHeader>

          {planDetails && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              {hasActivePlan && currentPlan && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <span>{PLANS.find(p => p.id === currentPlan)?.name ?? currentPlan}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{planDetails.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-semibold">Plan {planDetails.name}</span>
                <span className="font-bold">
                  {billingInterval === 'annual'
                    ? `${annualPrice(planDetails.id)}€/an`
                    : `${planDetails.price}€/mois`}
                </span>
              </div>
              {billingInterval === 'annual' && (
                <p className="text-xs font-medium text-emerald-600">
                  Facturation annuelle · 2 mois offerts (−{Math.round(ANNUAL_DISCOUNT * 100)}%)
                </p>
              )}
              <p className="text-sm text-muted-foreground">{planDetails.limitDesc}</p>
              {!isActive && !isCancelled && (
                <p className="text-xs text-muted-foreground mt-1">
                  7 jours d&apos;essai gratuit, vous ne serez prélevé qu&apos;à l&apos;issue de la période d&apos;essai.
                </p>
              )}
              {hasActivePlan && (
                <p className="text-xs text-muted-foreground mt-1">
                  Vos tokens actuels restent disponibles jusqu&apos;au renouvellement, puis remis à zéro avec la limite du nouveau plan.
                </p>
              )}
            </div>
          )}

          {/* ── CODE PROMO ──────────────────────────────────────────────────
              Le serveur savait déjà résoudre et appliquer un code (remise,
              durée, jours d'essai), mais AUCUN champ n'existait sur ce parcours
              — le principal. Les codes créés étaient donc inutilisables ici.
              Replié par défaut : un champ visible pousse à chercher un code. */}
          <div>
            {showPromo ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Code promo</label>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="EX : BIENVENUE20"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase tracking-wide outline-none focus:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  La remise s’affichera sur l’écran de confirmation Shopify avant validation.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPromo(true)}
                className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                J’ai un code promo
              </button>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={cgvAccepted}
              onChange={e => setCgvAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
            />
            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              J&apos;ai lu et j&apos;accepte les{' '}
              <Link href="/cgv" target="_blank" className="text-primary underline hover:no-underline" onClick={e => e.stopPropagation()}>
                CGV
              </Link>{' '}
              et les{' '}
              <Link href="/cgu" target="_blank" className="text-primary underline hover:no-underline" onClick={e => e.stopPropagation()}>
                CGU
              </Link>
              .
            </span>
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setSelectedPlan(null)} disabled={isProcessing}>
              Annuler
            </Button>
            <Button onClick={handleSubscribe} disabled={!cgvAccepted || isProcessing}>
              {isProcessing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{hasActivePlan ? 'Changement…' : 'Redirection…'}</>
              ) : (
                hasActivePlan ? 'Confirmer le changement' : isCancelled ? 'Se réabonner' : 'Continuer vers le paiement'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * ⚠️ CETTE PAGE REDIRIGE — l'abonnement vit désormais dans les Paramètres.
 *
 * Il y avait DEUX endroits pour la même chose : la jauge de crédits menait ici,
 * mais les Paramètres › Abonnement affichaient un résumé + un bouton renvoyant
 * ici, tandis que les tokens et le parrainage vivaient, eux, dans les Paramètres.
 * Le marchand ne savait plus où gérer quoi.
 *
 * On ne supprime pas la route : une quinzaine de liens y pointent (bandeaux,
 * badges, jauge, aide, callback d'achat, inscription…), sans compter les URL déjà
 * partagées ou mises en favori. Elle redirige donc vers l'onglet, ce qui les
 * garde tous valides.
 */
export default function SubscriptionPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/settings?tab=abonnement')
  }, [router])

  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
