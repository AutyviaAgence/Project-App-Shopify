'use client'

import { useTranslation } from '@/i18n/context'
import { WhatsAppConnect } from '@/components/whatsapp-connect'
import { ShopifyConnect } from '@/components/shopify-connect'
import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/tenant/context'
import { Meteors } from '@/components/ui/meteors'
import { TypingAnimation } from '@/components/ui/typing-animation'

// ─── Dashboard épuré — accueil + connexions, sans stats ──────────────────────

function DashboardHome() {
  const { t } = useTranslation()
  const tenant = useTenant()

  return (
    <div className="relative flex w-full flex-col gap-8 overflow-x-hidden p-4 pb-20 md:p-8 md:pt-12">
      {/* Animation météores en fond, dans une couche de CLIP dédiée : les
          traînées voyagent loin sous le conteneur et faisaient grandir la
          zone de scroll à chaque frame (barre de défilement qui saute). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Meteors number={20} className="opacity-60" />
      </div>

      {/* Accueil sobre */}
      <div data-tour="header" data-page-header className="relative z-10 space-y-1">
        <TypingAnimation
          as="p"
          className="text-sm font-normal leading-normal tracking-normal text-muted-foreground"
          duration={70}
        >
          {t('dashboard.greeting')}
        </TypingAnimation>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{tenant.appName}</h1>
        <p className="max-w-xl pt-1 text-sm text-muted-foreground">
          Votre espace de connexion. Reliez vos canaux et votre boutique pour que vos agents IA prennent le relais.
        </p>
      </div>

      {/* Connexions : WhatsApp + Boutique Shopify. */}
      <div className="relative z-10 grid gap-4 md:grid-cols-2">
        <WhatsAppConnect />
        <ShopifyConnect />
      </div>

    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Dashboard volontairement épuré : un accueil sobre + les cartes de connexion.
  // Aucune statistique ici — elles vivent dans la page « Statistics ».
  return <DashboardHome />
}

