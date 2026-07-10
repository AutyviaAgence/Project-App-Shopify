'use client'

import { useState, useSyncExternalStore } from 'react'

/** S'abonne à `prefers-reduced-motion` sans setState dans un effet. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const getReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches
// Côté serveur, on suppose « mouvement autorisé » : le client corrige à l'hydratation.
const getReducedMotionServer = () => false

/**
 * Animation d'attente de l'onboarding : la mascotte Xeyo, en boucle.
 *
 * - `loader.webp` : WebP animé à fond TRANSPARENT (une image, boucle native,
 *   aucun <video> à piloter). Il s'adapte donc aux thèmes clair et sombre.
 * - `prefers-reduced-motion` : on sert une image FIXE. Une classe CSS ne
 *   suffirait pas — l'animation est interne au fichier WebP, pas pilotée par
 *   CSS ; il faut changer la source.
 * - Si l'image échoue à charger, on retombe sur l'ancienne animation CSS :
 *   jamais d'écran vide.
 *
 * (Le nom du fichier/composant est conservé pour ne pas casser les imports.)
 */
export function MascotRunner({ height = 140 }: { frames?: string[]; height?: number }) {
  const [failed, setFailed] = useState(false)
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotionServer)

  if (failed) return <ScanFallback height={height} />

  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-xl"
      style={{ height }}
      aria-hidden="true"
    >
      {/* Halo doux derrière la mascotte, dans la couleur d'accent du tenant. */}
      <div
        className="pointer-events-none absolute h-24 w-24 rounded-full opacity-30 blur-2xl"
        style={{ background: 'var(--primary)' }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={reduced ? '/mascot/loader-static.webp' : '/mascot/loader.webp'}
        alt=""
        onError={() => setFailed(true)}
        className="relative h-full w-auto object-contain"
        style={{ maxHeight: height }}
      />
    </div>
  )
}

/** Ancienne animation : barre lumineuse qui balaie + points qui pulsent. */
function ScanFallback({ height }: { height: number }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-dashed bg-muted/20"
      style={{ height }}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 22px, color-mix(in oklab, var(--border) 60%, transparent) 22px 23px)',
        }}
      />
      <div
        className="animate-vscan pointer-events-none absolute inset-x-0 h-16 motion-reduce:hidden"
        style={{
          background: 'linear-gradient(to bottom, transparent, color-mix(in oklab, var(--primary) 35%, transparent), transparent)',
        }}
      />
      <div className="animate-vscan pointer-events-none absolute inset-x-8 h-px bg-primary/70 shadow-[0_0_12px_2px] shadow-primary/40 motion-reduce:hidden" />
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-primary/60 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  )
}
