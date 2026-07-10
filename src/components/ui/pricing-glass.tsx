'use client'

import React, { useState } from 'react'
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, type Variants } from 'framer-motion'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NOISE_PATTERN =
  'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")'

export type TierType = {
  id: string
  name: string
  /** Prix mensuel, sans devise (ex. "49"). "0" affiche « Gratuit ». */
  priceMonthly: string
  /** Prix en facturation annuelle (par mois). */
  priceAnnual: string
  description: string
  isPopular?: boolean
  features: string[]
  /** Libellé du bouton (défaut : « Choisir »). */
  cta?: string
}

export interface PricingGlassProps {
  title?: string
  description?: string
  tiers: TierType[]
  className?: string
  /** Devise affichée devant le prix (défaut : « € » en suffixe). */
  currency?: string
  /** Masque le sélecteur mensuel/annuel si aucun plan n'a de tarif annuel distinct. */
  showBillingToggle?: boolean
  /** Appelé au clic sur le bouton d'un tier. */
  onSelect?: (tierId: string, billing: 'monthly' | 'annual') => void
  /** Id du tier en cours de traitement (spinner + désactivation). */
  loadingTierId?: string | null
}

const legoVariant: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } },
}

function PricingCard({
  tier,
  isAnnual,
  currency,
  onSelect,
  loading,
  disabled,
}: {
  tier: TierType
  isAnnual: boolean
  currency: string
  onSelect?: (tierId: string, billing: 'monthly' | 'annual') => void
  loading: boolean
  disabled: boolean
}) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  const price = isAnnual ? tier.priceAnnual : tier.priceMonthly
  const isFree = price === '0'

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 60, scale: 0.95 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: 'spring', stiffness: 300, damping: 24, staggerChildren: 0.1, delayChildren: 0.15 },
        },
      }}
      onMouseMove={handleMouseMove}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-[32px] border backdrop-blur-2xl transition-all duration-500',
        // Verre theme-aware : on part du fond de carte translucide plutôt que du blanc pur.
        'bg-card/40 supports-[backdrop-filter]:bg-card/30',
        tier.isPopular
          ? 'border-primary/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)] md:-translate-y-4 dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]'
          : 'border-border/60 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.18)] dark:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]',
      )}
    >
      {/* Lueur qui suit le curseur. */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 rounded-[32px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`radial-gradient(600px at ${mouseX}px ${mouseY}px, color-mix(in oklab, var(--primary) 12%, transparent), transparent)`,
        }}
      />

      {/* Anneau rotatif pour le plan populaire. */}
      {tier.isPopular && (
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-[32px] p-px"
          style={{
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        >
          <div
            className="absolute -inset-full animate-[spin_4s_linear_infinite]"
            style={{ background: 'conic-gradient(from 0deg, transparent 70%, color-mix(in oklab, var(--primary) 80%, transparent) 100%)' }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: NOISE_PATTERN }} />

      {tier.isPopular && (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-b-xl border-x border-b border-primary/20 bg-primary/15 px-4 py-1 text-xs font-medium text-primary backdrop-blur-md">
          Le plus choisi
        </div>
      )}

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-8 md:p-10">
        <motion.h3 variants={legoVariant} className="text-xl font-semibold tracking-wide text-foreground/80">
          {tier.name}
        </motion.h3>

        <motion.div variants={legoVariant} className="mb-2 mt-4 flex items-baseline gap-1">
          <div className="flex h-[60px] items-center overflow-hidden">
            <AnimatePresence mode="popLayout">
              <motion.span
                key={price}
                initial={{ y: 40, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -40, opacity: 0, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="block text-[56px] font-bold leading-none tracking-tighter text-foreground"
              >
                {isFree ? 'Gratuit' : `${price}${currency}`}
              </motion.span>
            </AnimatePresence>
          </div>
          {!isFree && <span className="ml-1 text-lg font-medium text-muted-foreground">/mois</span>}
        </motion.div>

        <motion.p variants={legoVariant} className="mb-8 min-h-[40px] text-sm leading-relaxed text-muted-foreground">
          {tier.description}
        </motion.p>

        <motion.div variants={legoVariant} className="mb-8 h-px w-full bg-border" />

        <div className="mb-10 flex flex-1 flex-col gap-4">
          {tier.features.map((feat, i) => (
            <motion.div key={i} variants={legoVariant} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Check className="h-3 w-3 text-primary" strokeWidth={3} />
              </div>
              <span className="text-[14px] font-medium leading-tight text-foreground/70">{feat}</span>
            </motion.div>
          ))}
        </div>

        <motion.div variants={legoVariant} className="pointer-events-auto">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(tier.id, isAnnual ? 'annual' : 'monthly')}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-[16px] py-4 text-[15px] font-semibold transition-all duration-300 disabled:opacity-60',
              tier.isPopular
                ? 'bg-primary text-primary-foreground hover:scale-[1.02] hover:bg-primary/90'
                : 'border border-border bg-muted text-foreground hover:scale-[1.02] hover:bg-muted/70',
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {tier.cta ?? 'Choisir'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </motion.div>
      </div>
    </motion.div>
  )
}

export function PricingGlass({
  title = 'Choisissez votre formule',
  description = 'Vous pourrez changer de plan à tout moment.',
  tiers,
  className,
  currency = '€',
  showBillingToggle = true,
  onSelect,
  loadingTierId,
}: PricingGlassProps) {
  const [isAnnual, setIsAnnual] = useState(false)
  const busy = Boolean(loadingTierId)

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15 } } }}
      className={cn('relative flex w-full flex-col items-center justify-center gap-12 p-4', className)}
    >
      {/* Halo doux derrière les cartes. */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{ background: 'color-mix(in oklab, var(--primary) 8%, transparent)' }}
        animate={{ scale: isAnnual ? 1.05 : 1, opacity: isAnnual ? 0.9 : 0.6 }}
        transition={{ duration: 1 }}
      />

      <div className="relative z-20 flex w-full flex-col items-center gap-8">
        <div className="space-y-3 px-4 text-center">
          <motion.h2 variants={legoVariant} className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {title}
          </motion.h2>
          <motion.p variants={legoVariant} className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            {description}
          </motion.p>
        </div>

        {showBillingToggle && (
          <motion.div
            variants={legoVariant}
            className="relative flex items-center rounded-full border border-border bg-muted/50 p-1.5 backdrop-blur-xl"
          >
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                'relative z-10 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors duration-300 md:px-8',
                !isAnnual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              Mensuel
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                'relative z-10 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors duration-300 md:px-8',
                isAnnual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              Annuel
              <span className="absolute -right-3 -top-3 rounded-full bg-primary px-2 py-1 text-[10px] font-bold tracking-wider text-primary-foreground shadow-lg md:-right-6">
                -20%
              </span>
            </button>

            <motion.div
              className="absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-6px)] rounded-full border border-border bg-background shadow-sm"
              animate={{ x: isAnnual ? '100%' : '0%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          </motion.div>
        )}
      </div>

      <div className="relative z-20 grid w-full grid-cols-1 items-stretch gap-6 md:grid-cols-3 lg:gap-8">
        {tiers.map((tier) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            isAnnual={isAnnual}
            currency={currency}
            onSelect={onSelect}
            loading={loadingTierId === tier.id}
            disabled={busy}
          />
        ))}
      </div>
    </motion.div>
  )
}
