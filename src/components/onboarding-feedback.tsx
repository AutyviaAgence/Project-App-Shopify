'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'

/**
 * Validation d'étape de l'onboarding : une CARTE physique (verre épais) qui
 * CHUTE dans l'écran avec du poids — spring à faible amortissement, rebond
 * visible, légère rotation qui se stabilise — plutôt qu'un jeu de lumière.
 * À l'impact : éclat de particules. La carte contient le message en grand,
 * l'étape suivante annoncée, et sa barre de chargement intégrée.
 *
 * La pause parente (goTo) dure ~2,6 s : le temps de LIRE.
 */

// Éclat de particules à l'impact de la carte (positions fixes, pas de random
// pour éviter tout écart d'hydratation). x/y = destination, s = taille px.
const BURST = [
  { x: -150, y: -90, s: 9, c: 'bg-primary' },
  { x: 140, y: -110, s: 7, c: 'bg-sky-400' },
  { x: -190, y: 10, s: 6, c: 'bg-white/80' },
  { x: 200, y: -20, s: 8, c: 'bg-primary' },
  { x: -110, y: 90, s: 7, c: 'bg-sky-400' },
  { x: 120, y: 100, s: 6, c: 'bg-white/70' },
  { x: 30, y: -140, s: 6, c: 'bg-primary/80' },
  { x: -40, y: 130, s: 8, c: 'bg-sky-300' },
]

export function OnboardingFeedback({
  feedback,
}: {
  feedback: { message: string; next?: string } | null
}) {
  if (!feedback) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* Voile flouté */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[#060912]/85 backdrop-blur-xl"
      />

      {/* Éclat de particules à l'impact (départ du centre, léger délai le
          temps que la carte atterrisse). */}
      {BURST.map((p, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`absolute rounded-full ${p.c}`}
          style={{ width: p.s, height: p.s }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
          transition={{ duration: 0.9, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      {/* LA CARTE : chute avec du poids, rebond, rotation qui se stabilise. */}
      <motion.div
        initial={{ y: -260, opacity: 0, rotate: -5, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 13, mass: 1.15 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#0e1626]/95 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
      >
        <div className="flex items-center gap-5 px-7 py-6">
          {/* Badge : pastille pleine, pop avec le rebond de la carte. */}
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.18 }}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-500 shadow-[0_10px_30px_-6px] shadow-primary/50"
          >
            <Check className="h-8 w-8 text-white" strokeWidth={3.5} />
          </motion.div>

          <div className="min-w-0 text-left">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
              className="text-xl font-bold leading-snug tracking-tight text-white"
            >
              {feedback.message}
            </motion.p>
            {feedback.next && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.4, ease: 'easeOut' }}
                className="mt-1.5 flex items-center gap-1.5 text-sm text-white/50"
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                Étape suivante : {feedback.next}
              </motion.p>
            )}
          </div>
        </div>

        {/* Barre de chargement intégrée : se remplit pendant la pause. */}
        <div className="h-1 w-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-sky-400"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, delay: 0.45, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </div>
  )
}
