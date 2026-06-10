'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * BlobLoader — loader "metaball" organique : des bulles vertes qui se déplacent
 * en 2D, fusionnent et se séparent en formes fluides (inspiré du logo Autyvia).
 * Recréé en SVG animé (filtre goo). Vectoriel, léger, fond transparent.
 */
export function BlobLoader({
  size = 96,
  className,
  label,
}: {
  size?: number
  className?: string
  /** Texte affiché sous l'animation (optionnel) */
  label?: string
}) {
  const id = useId().replace(/:/g, '')
  const gooId = `goo-${id}`
  const gradId = `grad-${id}`

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)} role="status" aria-label={label || 'Chargement'}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="blob-loader"
      >
        <defs>
          {/* Filtre "goo" : flou + seuil de contraste = fusion fluide quand les bulles se rapprochent */}
          <filter id={gooId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
          </filter>

          {/* Dégradé de bleus Xeyo */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#6B8CFF" />
            <stop offset="50%"  stopColor="#365EFF" />
            <stop offset="100%" stopColor="#1E3AD1" />
          </linearGradient>
        </defs>

        <g filter={`url(#${gooId})`} fill={`url(#${gradId})`}>
          {/* Bulles qui dérivent en 2D, déphasées → fusion/séparation organique */}
          <circle r="13" className="b b1" />
          <circle r="11" className="b b2" />
          <circle r="14" className="b b3" />
          <circle r="10" className="b b4" />
        </g>
      </svg>

      {label && <p className="text-sm text-muted-foreground animate-pulse">{label}</p>}

      <style jsx>{`
        .blob-loader { overflow: visible; }
        .b { transform-box: fill-box; transform-origin: center; }

        /* Chaque bulle suit une boucle 2D différente autour du centre (50,50) */
        .b1 { animation: orbit1 3.2s ease-in-out infinite; }
        .b2 { animation: orbit2 3.8s ease-in-out infinite; }
        .b3 { animation: orbit3 3.5s ease-in-out infinite; }
        .b4 { animation: orbit4 4.1s ease-in-out infinite; }

        /* Amplitudes larges : les bulles s'écartent (parfois isolées) puis se
           rejoignent au centre (fusion via goo) → effet metaball organique. */
        @keyframes orbit1 {
          0%   { transform: translate(22px, 30px); }
          30%  { transform: translate(50px, 22px); }
          55%  { transform: translate(72px, 52px); }
          80%  { transform: translate(40px, 70px); }
          100% { transform: translate(22px, 30px); }
        }
        @keyframes orbit2 {
          0%   { transform: translate(74px, 40px); }
          30%  { transform: translate(48px, 74px); }
          55%  { transform: translate(24px, 48px); }
          80%  { transform: translate(58px, 26px); }
          100% { transform: translate(74px, 40px); }
        }
        @keyframes orbit3 {
          0%   { transform: translate(46px, 72px); }
          30%  { transform: translate(26px, 44px); }
          55%  { transform: translate(56px, 24px); }
          80%  { transform: translate(76px, 58px); }
          100% { transform: translate(46px, 72px); }
        }
        @keyframes orbit4 {
          0%   { transform: translate(56px, 26px); }
          30%  { transform: translate(74px, 60px); }
          55%  { transform: translate(42px, 76px); }
          80%  { transform: translate(24px, 40px); }
          100% { transform: translate(56px, 26px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .b { animation: pulse 1.6s ease-in-out infinite; }
          .b1 { transform: translate(36px, 44px); }
          .b2 { transform: translate(64px, 44px); }
          .b3 { transform: translate(44px, 64px); }
          .b4 { transform: translate(60px, 60px); }
          @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
        }
      `}</style>
    </div>
  )
}

/** Variante plein écran centrée — pour les chargements de page. */
export function BlobLoaderScreen({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <BlobLoader size={110} label={label} />
    </div>
  )
}
