'use client'

import React from 'react'
import { motion } from 'framer-motion'

/**
 * Flow "constellation" : 3 étoiles (Événement, Délai, Action) reliées par des
 * faisceaux lumineux qui voyagent d'une étoile à l'autre. Les étoiles
 * scintillent. Inspiré des "pulse beams" + sparkles.
 */

type Star = { label: string; sub?: string; color: string }

// Étoile SVG à 4 branches (sparkle).
function StarShape({ color, size = 26, twinkle = 0 }: { color: string; size?: number; twinkle?: number }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 21 21"
      animate={{ scale: [1, 1.18, 1], opacity: [0.85, 1, 0.85], rotate: [0, 8, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: twinkle }}
      style={{ filter: `drop-shadow(0 0 6px ${color})` }}
    >
      <path
        d="M9.82531 0.843845C10.0553 0.215178 10.9446 0.215178 11.1746 0.843845L11.8618 2.72026C12.4006 4.19229 12.3916 6.39157 13.5 7.5C14.6084 8.60843 16.8077 8.59935 18.2797 9.13822L20.1561 9.82534C20.7858 10.0553 20.7858 10.9447 20.1561 11.1747L18.2797 11.8618C16.8077 12.4007 14.6084 12.3916 13.5 13.5C12.3916 14.6084 12.4006 16.8077 11.8618 18.2798L11.1746 20.1562C10.9446 20.7858 10.0553 20.7858 9.82531 20.1562L9.13819 18.2798C8.59932 16.8077 8.60843 14.6084 7.5 13.5C6.39157 12.3916 4.19225 12.4007 2.72023 11.8618L0.843814 11.1747C0.215148 10.9447 0.215148 10.0553 0.843814 9.82534L2.72023 9.13822C4.19225 8.59935 6.39157 8.60843 7.5 7.5C8.60843 6.39157 8.59932 4.19229 9.13819 2.72026L9.82531 0.843845Z"
        fill={color}
      />
    </motion.svg>
  )
}

// Faisceau lumineux entre deux étoiles (ligne SVG avec dégradé qui voyage).
function Beam({ active, delay }: { active: boolean; delay: number }) {
  const id = React.useId()
  return (
    <div className="relative h-7 flex-1">
      <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" className="absolute inset-0">
        {/* trait de base */}
        <line x1="0" y1="14" x2="120" y2="14" stroke="currentColor" strokeWidth="1" className="text-border" />
        {active && (
          <>
            <line x1="0" y1="14" x2="120" y2="14" stroke={`url(#${id})`} strokeWidth="2.5" strokeLinecap="round" />
            <motion.linearGradient
              id={id} gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="40" y2="14"
              animate={{ x1: ['-40', '120'], x2: ['0', '160'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay }}
            >
              <stop offset="0%" stopColor="#7DA0FF" stopOpacity="0" />
              <stop offset="50%" stopColor="#3B82F6" stopOpacity="1" />
              <stop offset="100%" stopColor="#7DA0FF" stopOpacity="0" />
            </motion.linearGradient>
          </>
        )}
      </svg>
    </div>
  )
}

export function ConstellationFlow({ active, stars }: { active: boolean; stars: Star[] }) {
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {stars.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1 text-center">
            <StarShape color={s.color} twinkle={i * 0.5} />
            <span className="max-w-[90px] truncate text-[11px] font-medium leading-tight text-foreground">{s.label}</span>
            {s.sub && <span className="text-[10px] text-muted-foreground">{s.sub}</span>}
          </div>
          {i < stars.length - 1 && <Beam active={active} delay={i * 0.6} />}
        </React.Fragment>
      ))}
    </div>
  )
}
