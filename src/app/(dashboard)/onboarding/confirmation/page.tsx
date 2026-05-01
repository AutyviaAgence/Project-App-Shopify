'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, Mail } from 'lucide-react'

export default function OnboardingConfirmationPage() {
  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Configurateur envoyé !</h1>
          <p className="text-muted-foreground">
            Merci. Notre équipe va maintenant paramétrer votre plateforme WhatsApp IA selon vos choix.
          </p>
        </div>

        <div className="rounded-xl bg-muted/50 p-5 text-left space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Délai de configuration : 14 à 30 jours</p>
              <p className="text-muted-foreground">Notre équipe configure et teste votre agent en coulisses.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Notification par email</p>
              <p className="text-muted-foreground">Vous recevrez un email et une notification pour payer le solde (445€) avant la remise des accès.</p>
            </div>
          </div>
        </div>

        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Aller aux paramètres
        </Link>
      </div>
    </div>
  )
}
