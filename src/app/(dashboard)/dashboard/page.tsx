'use client'

import Link from 'next/link'
import { BookOpen, ArrowRight } from 'lucide-react'
import { useTranslation } from '@/i18n/context'
import { WhatsAppConnect } from '@/components/whatsapp-connect'
import { EmailConnect } from '@/components/email-connect'
import { ShopifyConnect } from '@/components/shopify-connect'
import { EMAIL_UI_ENABLED } from '@/lib/features'
import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/tenant/context'

// ─── Dashboard épuré — accueil + connexions, sans stats ──────────────────────

function DashboardHome() {
  const { t } = useTranslation()
  const tenant = useTenant()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 pb-20 md:p-8 md:pt-12">
      {/* Accueil sobre */}
      <div data-tour="header" data-page-header className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('dashboard.greeting')}</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{tenant.appName}</h1>
        <p className="max-w-xl pt-1 text-sm text-muted-foreground">
          Votre espace de connexion. Reliez vos canaux et votre boutique pour que vos agents IA prennent le relais.
        </p>
      </div>

      {/* Connexions : WhatsApp, (Email), Boutique Shopify.
          La grille s'adapte au nombre de cartes (2 sans email, 3 avec). */}
      <div className={cn('grid gap-4', EMAIL_UI_ENABLED ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2')}>
        <WhatsAppConnect />
        {EMAIL_UI_ENABLED && <EmailConnect />}
        <ShopifyConnect />
      </div>

      {/* Accès discret aux ressources/médias (docs + images/vidéos envoyables). */}
      <Link
        href="/ressources"
        className="group flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
      >
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <span className="font-medium">Ressources & médias</span>
          <span className="ml-2 text-muted-foreground">Documents, images et vidéos que vos agents peuvent envoyer.</span>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Dashboard volontairement épuré : un accueil sobre + les cartes de connexion.
  // Aucune statistique ici — elles vivent dans la page « Statistics ».
  return <DashboardHome />
}

