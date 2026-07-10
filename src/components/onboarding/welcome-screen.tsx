'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, MessageSquare, ShoppingBag, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Meteors } from '@/components/ui/meteors'

const FEATURES = [
  { icon: MessageSquare, label: 'Répond à vos clients', hint: '24h/24, sur WhatsApp' },
  { icon: ShoppingBag, label: 'Connaît votre boutique', hint: 'Catalogue, politiques, commandes' },
  { icon: Sparkles, label: 'Relance et fidélise', hint: 'Paniers abandonnés, suivi de commande' },
]

/**
 * Écran de bienvenue, affiché une seule fois à l'arrivée dans l'onboarding.
 *
 * L'animation est ORCHESTRÉE : le conteneur cadence ses enfants (staggerChildren)
 * plutôt que de leur donner un `delay` codé en dur — ajouter une ligne ne casse
 * donc pas le rythme.
 *
 * `useReducedMotion` : si l'utilisateur limite les animations, tout apparaît
 * d'un coup, sans mouvement (exigence d'accessibilité).
 */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : 0.12, delayChildren: reduced ? 0 : 0.15 },
    },
  }
  const item = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0, y: 16, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring' as const, stiffness: 260, damping: 24 },
    },
  }

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Fond : halo doux + météores (composant maison, déjà présent). */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(45% 45% at 50% 40%, color-mix(in oklab, var(--primary) 14%, transparent) 0%, transparent 100%)',
        }}
      />
      {!reduced && <Meteors number={14} />}

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 flex w-full max-w-lg flex-col items-center"
      >
        {/* Mascotte. Deux couches : le wrapper porte l'APPARITION (variants du
            conteneur), l'enfant le FLOTTEMENT en boucle — mettre les deux sur le
            même élément ferait écraser `variants` par `animate`. */}
        <motion.div variants={item}>
          <motion.div
            animate={reduced ? undefined : { y: [0, -8, 0] }}
            transition={reduced ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/celebrate.png" alt="" className="h-40 w-auto drop-shadow-2xl" />
          </motion.div>
        </motion.div>

        <motion.h1 variants={item} className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Bienvenue sur Xeyo
        </motion.h1>

        <motion.p variants={item} className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
          Votre agent IA va répondre à vos clients sur WhatsApp, à partir de votre boutique.
          Trois minutes de configuration, et il s’occupe du reste.
        </motion.p>

        <motion.ul variants={item} className="mt-8 grid w-full gap-2.5 text-left">
          {FEATURES.map((f) => (
            <li
              key={f.label}
              className="flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 backdrop-blur-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            </li>
          ))}
        </motion.ul>

        <motion.div variants={item} className="mt-8">
          <Button size="lg" onClick={onStart} className="group h-12 px-8 text-base">
            Configurer mon agent
            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}
