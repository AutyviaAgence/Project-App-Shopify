'use client'

import { motion } from 'framer-motion'

/**
 * Célébration plein écran entre deux étapes de l'onboarding, dans le langage
 * cinématique de l'intro (fond nuit, halo, verre) :
 *  - voile sombre flouté qui masque le contenu derrière
 *  - coche SVG qui SE DESSINE (cercle puis trait, animation de tracé)
 *  - anneaux d'onde qui se propagent depuis la pastille
 *  - message en grand, révélé flou → net
 *  - fine barre de progression « on enchaîne » qui se remplit
 *
 * Pas d'emoji : le visuel porte la célébration, le texte reste sobre.
 */
export function OnboardingFeedback({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Voile flouté */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[#060912]/85 backdrop-blur-xl"
      />

      {/* Halo central */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute h-[440px] w-[440px] rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--primary) 20%, transparent) 0%, transparent 70%)' }}
      />

      {/* Anneaux d'onde */}
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-primary/30"
          initial={{ width: 112, height: 112, opacity: 0.7 }}
          animate={{ width: 300 + i * 90, height: 300 + i * 90, opacity: 0 }}
          transition={{ duration: 1.3, delay: 0.2 + i * 0.25, ease: 'easeOut' }}
        />
      ))}

      <div className="relative flex flex-col items-center gap-6 px-6">
        {/* Pastille + coche dessinée */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 shadow-[0_0_70px_-10px] shadow-primary/60 ring-1 ring-primary/40 backdrop-blur-sm"
        >
          <svg viewBox="0 0 52 52" className="h-14 w-14 text-primary">
            {/* Cercle tracé depuis 12 h */}
            <g transform="rotate(-90 26 26)">
              <motion.circle
                cx="26" cy="26" r="23" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
            </g>
            {/* Coche tracée après le cercle */}
            <motion.path
              d="M15 27 l7.5 7.5 L37 19"
              fill="none" stroke="currentColor" strokeWidth="4"
              strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.45, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>

        {/* Message en grand, révélé flou → net */}
        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.35, duration: 0.5, ease: 'easeOut' }}
          className="max-w-lg text-center text-2xl font-bold tracking-tight text-white sm:text-3xl"
        >
          {message}
        </motion.p>

        {/* « On enchaîne » : fine barre qui se remplit pendant la pause. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="h-1 w-44 overflow-hidden rounded-full bg-white/10"
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1, delay: 0.5, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </div>
  )
}
