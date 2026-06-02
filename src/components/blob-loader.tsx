'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * BlobLoader — loader "metaball" : des bulles qui fusionnent horizontalement.
 * Recréé en SVG animé (filtre goo) avec un dégradé de verts (couleur du logo).
 * Vectoriel, léger, fond transparent.
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
        height={size * 0.55}
        viewBox="0 0 200 110"
        xmlns="http://www.w3.org/2000/svg"
        className="blob-loader"
      >
        <defs>
          {/* Filtre "goo" : flou + seuil de contraste = fusion des bulles */}
          <filter id={gooId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
          </filter>

          {/* Dégradé de verts (du clair au foncé) basé sur la couleur du logo */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#A8E6C9" />
            <stop offset="38%"  stopColor="#7DC2A5" />
            <stop offset="70%"  stopColor="#4FA384" />
            <stop offset="100%" stopColor="#2F7A5F" />
          </linearGradient>
        </defs>

        <g filter={`url(#${gooId})`} fill={`url(#${gradId})`}>
          {/* 4 bulles qui oscillent verticalement en décalé → effet de vague */}
          <circle cx="45"  cy="55" r="16" className="blob blob-1" />
          <circle cx="82"  cy="55" r="18" className="blob blob-2" />
          <circle cx="119" cy="55" r="20" className="blob blob-3" />
          <circle cx="156" cy="55" r="16" className="blob blob-4" />
        </g>
      </svg>

      {label && <p className="text-sm text-muted-foreground animate-pulse">{label}</p>}

      <style jsx>{`
        .blob {
          animation: blob-bob 1.4s ease-in-out infinite;
        }
        .blob-1 { animation-delay: 0s; }
        .blob-2 { animation-delay: 0.18s; }
        .blob-3 { animation-delay: 0.36s; }
        .blob-4 { animation-delay: 0.54s; }

        @keyframes blob-bob {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-14px) scale(1.12); }
        }

        .blob-loader { overflow: visible; }

        @media (prefers-reduced-motion: reduce) {
          .blob { animation: blob-pulse 1.6s ease-in-out infinite; }
          @keyframes blob-pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
        }
      `}</style>
    </div>
  )
}

/** Variante plein écran centrée — pour les chargements de page. */
export function BlobLoaderScreen({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <BlobLoader size={120} label={label} />
    </div>
  )
}
