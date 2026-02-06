'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import {
  Check,
  CreditCard,
  Loader2,
  Calendar,
  Zap,
  MessageSquare,
  Bot,
  Users,
  BarChart,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  Cpu,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FEATURES = [
  { icon: MessageSquare, text: 'Conversations WhatsApp illimitées' },
  { icon: Bot, text: 'Agents IA personnalisés' },
  { icon: Users, text: 'Gestion des équipes' },
  { icon: BarChart, text: 'Statistiques avancées' },
  { icon: Zap, text: 'Automatisation des réponses' },
  { icon: Shield, text: 'Chiffrement des messages' },
]

function SubscriptionContent() {
  const searchParams = useSearchParams()
  const { subscription, loading, refetch } = useSubscription()
  const [isProcessing, setIsProcessing] = useState(false)

  // Gérer les redirections depuis Stripe
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      // Synchroniser l'abonnement depuis Stripe (fallback si le webhook n'a pas fonctionné)
      fetch('/api/subscription/sync', { method: 'POST' })
        .then(() => refetch())
        .then(() => toast.success('Paiement réussi ! Votre abonnement est maintenant actif.'))
        .catch(() => refetch())
    } else if (searchParams.get('cancelled') === 'true') {
      toast.info('Paiement annulé.')
    } else if (searchParams.get('tokens_success') === 'true') {
      refetch().then(() => toast.success('Tokens ajoutés avec succès !'))
    }
  }, [searchParams, refetch])

  const handleSubscribe = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création de la session')
      }

      // Si l'abonnement est déjà actif côté Stripe, rafraîchir
      if (data.already_active) {
        toast.success('Votre abonnement est déjà actif ! Profil resynchronisé.')
        await refetch()
        setIsProcessing(false)
        return
      }

      // Rediriger vers Stripe Checkout
      window.location.href = data.url
    } catch (error) {
      console.error('[Subscription] Error:', error)
      toast.error('Erreur lors de la redirection vers le paiement')
      setIsProcessing(false)
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
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Abonnement</h1>
        <p className="mt-2 text-muted-foreground">
          Gérez votre abonnement Autyvia
        </p>
      </div>

      {/* Statut actuel */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Votre abonnement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Statut :</span>
                <Badge
                  variant={subscription?.isActive ? 'default' : 'destructive'}
                  className={cn(
                    subscription?.status === 'trial' && 'bg-amber-500 hover:bg-amber-600',
                    subscription?.status === 'active' && 'bg-green-500 hover:bg-green-600'
                  )}
                >
                  {subscription?.status === 'trial' && 'Période d\'essai'}
                  {subscription?.status === 'active' && 'Actif'}
                  {subscription?.status === 'expired' && 'Expiré'}
                  {subscription?.status === 'cancelled' && 'Annulé'}
                </Badge>
              </div>

              {subscription?.status === 'trial' && subscription.trialEndsAt && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Fin de l&apos;essai :</span>{' '}
                  <span className="font-medium">{formatDate(subscription.trialEndsAt)}</span>
                  {subscription.daysRemaining !== null && (
                    <span className="text-muted-foreground"> ({subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''})</span>
                  )}
                </p>
              )}

              {subscription?.status === 'active' && subscription.subscriptionEndsAt && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Valide jusqu&apos;au :</span>{' '}
                  <span className="font-medium">{formatDate(subscription.subscriptionEndsAt)}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {subscription?.isActive ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Accès actif</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Accès expiré</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Utilisation des tokens IA */}
      {subscription && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Utilisation des tokens IA
            </CardTitle>
            <CardDescription>
              {subscription.status === 'trial'
                ? 'Période d\'essai : 200 000 tokens inclus'
                : subscription.status === 'active'
                  ? 'Abonnement : 5 000 000 tokens/mois inclus'
                  : 'Aucun quota actif'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {subscription.tokensUsed.toLocaleString()} / {subscription.tokensLimit.toLocaleString()} tokens
                </span>
                <span className={cn(
                  'font-medium',
                  subscription.usagePercentage < 70 && 'text-green-600',
                  subscription.usagePercentage >= 70 && subscription.usagePercentage < 90 && 'text-amber-600',
                  subscription.usagePercentage >= 90 && 'text-red-600',
                )}>
                  {subscription.usagePercentage}%
                </span>
              </div>
              <Progress
                value={Math.min(subscription.usagePercentage, 100)}
                className={cn(
                  'h-3',
                  subscription.usagePercentage >= 90 && '[&>div]:bg-red-500',
                  subscription.usagePercentage >= 70 && subscription.usagePercentage < 90 && '[&>div]:bg-amber-500',
                )}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {subscription.tokensRemaining.toLocaleString()} tokens restants
              </span>
              {subscription.usagePercentage >= 90 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/buy-tokens', { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      window.location.href = data.url
                    } catch {
                      toast.error('Erreur lors de la création du paiement')
                    }
                  }}
                >
                  <Zap className="mr-1 h-3 w-3" />
                  Acheter 500K tokens
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offre d'abonnement */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Abonnement Autyvia</CardTitle>
          <CardDescription>
            Accès complet à toutes les fonctionnalités
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="mb-6">
            <span className="text-5xl font-bold">150€</span>
            <span className="text-muted-foreground">/mois</span>
          </div>

          <div className="grid gap-3 text-left mb-6">
            {FEATURES.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm">{feature.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          {subscription?.status === 'active' ? (
            <Button className="w-full" size="lg" disabled>
              <Check className="mr-2 h-5 w-5" />
              Abonnement actif
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubscribe}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirection...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-5 w-5" />
                  S&apos;abonner maintenant
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Note */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Clock className="inline-block h-4 w-4 mr-1" />
        Paiement sécurisé par Stripe. Vous pouvez annuler à tout moment.
      </p>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SubscriptionContent />
    </Suspense>
  )
}
