'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, MessageSquare, RefreshCw, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Meteors } from '@/components/ui/meteors'

const FEATURES = [
  {
    icon: MessageSquare,
    label: 'Répond à vos clients',
    hint: '24h/24 sur WhatsApp, sans vous',
    from: 'from-sky-500/15',
    ring: 'text-sky-500',
  },
  {
    icon: ShoppingBag,
    label: 'Connaît votre boutique',
    hint: 'Catalogue, politiques, commandes',
    from: 'from-violet-500/15',
    ring: 'text-violet-500',
  },
  {
    icon: RefreshCw,
    label: 'Relance et fidélise',
    hint: 'Paniers abandonnés, suivi de commande',
    from: 'from-emerald-500/15',
    ring: 'text-emerald-500',
  },
]

/**
 * Écran de bienvenue immersif, joué une seule fois à l'arrivée dans l'onboarding.
 *
 * C'est une SÉQUENCE cadencée (machine à états `phase`), pas un simple
 * `staggerChildren` : le sous-titre APPARAÎT puis S'EFFACE avant que les cartes
 * n'entrent — un stagger ne sait pas faire disparaître un élément en cours de
 * route. Les phases :
 *   0  headline « Bienvenue sur Xeyo.io ! » en dégradé
 *   1  sous-titre « Une solution pour connecter Shopify à WhatsApp… »
 *   2  le sous-titre s'efface, les 3 cartes entrent de GAUCHE à DROITE
 *   3  le bouton « Configurer mon agent » apparaît
 *
 * `useReducedMotion` : tout est montré d'emblée, sans transitions (accessibilité).
 */
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 3 : 0)

  useEffect(() => {
    if (reduced) return
    // Minuteries cumulatives : chaque phase déclenche la suivante.
    const timers = [
      setTimeout(() => setPhase(1), 900), // le sous-titre entre
      setTimeout(() => setPhase(2), 3200), // il s'efface, les cartes arrivent
      setTimeout(() => setPhase(3), 4100), // le bouton apparaît
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  return (
    <div className="relative flex min-h-[78vh] w-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Fond : halo qui pulse doucement + météores. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(50% 50% at 50% 38%, color-mix(in oklab, var(--primary) 16%, transparent) 0%, transparent 100%)',
        }}
        animate={reduced ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={reduced ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      {!reduced && <Meteors number={16} />}

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        {/* Mascotte animée (WebP détouré, boucle native). */}
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.6, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        >
          <motion.div
            animate={reduced ? undefined : { y: [0, -7, 0] }}
            transition={reduced ? undefined : { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={reduced ? '/mascot/loader-static.webp' : '/mascot/loader.webp'}
              alt=""
              className="h-40 w-auto drop-shadow-2xl"
            />
          </motion.div>
        </motion.div>

        {/* Phase 0 — headline en dégradé qui se révèle peu à peu. */}
        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="mt-5 bg-gradient-to-r from-primary via-fuchsia-500 to-primary bg-[length:200%_auto] bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl"
          style={reduced ? undefined : { animation: 'welcome-shine 5s linear infinite' }}
        >
          Bienvenue sur Xeyo.io !
        </motion.h1>

        {/* Zone centrale à hauteur réservée : le sous-titre (phase 1) puis les
            cartes (phase 2) l'occupent tour à tour, sans saut de mise en page. */}
        <div className="mt-5 flex min-h-[168px] w-full items-center justify-center">
          <AnimatePresence mode="wait">
            {phase < 2 ? (
              <motion.p
                key="tagline"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: phase >= 1 ? 1 : 0, y: 0 }}
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                className="max-w-md text-base text-muted-foreground sm:text-lg"
              >
                Une solution pour connecter votre boutique Shopify à WhatsApp,
                et laisser une IA s’occuper de vos clients.
              </motion.p>
            ) : (
              <motion.ul
                key="features"
                className="grid w-full gap-3 sm:grid-cols-3"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.18 } } }}
              >
                {FEATURES.map((f) => (
                  <motion.li
                    key={f.label}
                    variants={{
                      // Entrée de la GAUCHE, une carte après l'autre.
                      hidden: reduced ? { opacity: 1 } : { opacity: 0, x: -32, filter: 'blur(6px)' },
                      show: {
                        opacity: 1,
                        x: 0,
                        filter: 'blur(0px)',
                        transition: { type: 'spring', stiffness: 240, damping: 22 },
                      },
                    }}
                    className="group relative overflow-hidden rounded-2xl border bg-card/60 p-4 text-left shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md"
                  >
                    {/* Halo coloré propre à chaque carte, révélé au survol. */}
                    <div
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.from} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                    />
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ${f.ring}`}
                    >
                      <f.icon className="h-5 w-5" />
                    </span>
                    <p className="relative mt-3 text-sm font-semibold">{f.label}</p>
                    <p className="relative mt-1 text-xs text-muted-foreground">{f.hint}</p>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* Phase 3 — le bouton entre en dernier. */}
        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="mt-4"
            >
              <Button size="lg" onClick={onStart} className="group h-12 px-8 text-base shadow-lg shadow-primary/20">
                Configurer mon agent
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
