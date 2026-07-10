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

/** Particules qui montent doucement autour de la mascotte. Positions fixes
 *  (pas de Math.random) pour éviter tout écart d'hydratation SSR/client. */
const PARTICLES = [
  { left: '14%', delay: '0s', size: 3, dur: '4.5s' },
  { left: '26%', delay: '1.6s', size: 2, dur: '5.5s' },
  { left: '38%', delay: '0.8s', size: 2, dur: '5s' },
  { left: '62%', delay: '2.2s', size: 3, dur: '4.8s' },
  { left: '74%', delay: '0.4s', size: 2, dur: '5.8s' },
  { left: '86%', delay: '3s', size: 2, dur: '5.2s' },
]

/**
 * Animation d'attente de l'onboarding : la mascotte Xeyo, en boucle, posée dans
 * un petit décor (halo, sol, ombre portée, particules).
 *
 * - `loader.webp` : WebP animé à fond TRANSPARENT (boucle native, aucun <video>
 *   à piloter). Il s'adapte donc aux thèmes clair et sombre.
 * - Le décor est en CSS pur : aucune dépendance ajoutée.
 * - `prefers-reduced-motion` : on sert une image FIXE et on coupe le décor animé.
 *   Une classe CSS ne suffirait pas — l'animation est interne au WebP.
 * - Si l'image échoue à charger, repli sur l'ancienne animation CSS.
 *
 * (Le nom du fichier/composant est conservé pour ne pas casser les imports.)
 */
export function MascotRunner({ height = 220 }: { frames?: string[]; height?: number }) {
  const [failed, setFailed] = useState(false)
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotionServer)

  if (failed) return <ScanFallback height={height} />

  return (
    // Pas de cadre ni d'`overflow-hidden` : le loader se fond dans la page. Le
    // bloc arrondi dessinait une carte dont on voyait les arêtes en bas, et le
    // recadrage tranchait le halo comme les particules.
    <div
      className="relative w-full"
      style={{ height }}
      aria-hidden="true"
    >
      {/* UNE SEULE source de lumière : un halo radial centré sur la mascotte.
          Le « sol » précédent (linear-gradient + ligne d'horizon) dessinait un
          rectangle aux arêtes verticales franches, même masqué, la coupure
          restait visible. L'ombre portée suffit à poser la mascotte au sol.
          Ellipse large et très douce : la couleur s'éteint bien avant les bords. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(38% 46% at 50% 52%, color-mix(in oklab, var(--primary) 16%, transparent) 0%, color-mix(in oklab, var(--primary) 5%, transparent) 50%, transparent 100%)',
        }}
      />

      {/* Particules ascendantes (coupées si l'utilisateur limite les animations). */}
      {!reduced && (
        <div className="pointer-events-none absolute inset-0">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="animate-float-up absolute bottom-0 rounded-full bg-primary/40"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                animationDelay: p.delay,
                animationDuration: p.dur,
              }}
            />
          ))}
        </div>
      )}

      {/* Mascotte + son ombre portée */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reduced ? '/mascot/loader-static.webp' : '/mascot/loader.webp'}
          alt=""
          onError={() => setFailed(true)}
          className="relative z-10 w-auto object-contain"
          style={{ height: Math.round(height * 0.78) }}
        />
        {/* Ombre au sol : elle « respire » au rythme du saut de la mascotte. */}
        <div
          className={`h-2 rounded-[100%] bg-black/40 blur-md dark:bg-black/60 ${reduced ? '' : 'animate-shadow-pulse'}`}
          style={{ width: Math.round(height * 0.32), marginTop: -Math.round(height * 0.04) }}
        />
      </div>
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
