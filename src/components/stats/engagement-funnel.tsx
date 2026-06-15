'use client'

import { useState } from 'react'

/**
 * Entonnoir d'engagement (SVG animé, interactif). Reprend la maquette
 * ai_automation_hub_funnel_v11.svg : au survol/clic d'un étage, surbrillance +
 * balayage lumineux. Affiche jusqu'à 4 étages (contacts → conversations →
 * reçus → répondus, ou tout autre entonnoir à 4 valeurs).
 */
export function EngagementFunnel({ steps }: { steps: { label: string; value: number }[] }) {
  const [active, setActive] = useState<number | null>(null)

  // Définition de chaque étage : polygone, liseré clair, étiquette (ligne+point+pill)
  const tiers = [
    {
      body: '150,150 530,150 482,235 198,235', top: '150,150 530,150 524,162 156,162',
      fill: '#7DA0FF', topFill: '#9DB6FF',
      lineX1: 540, lineY: 175, dotX: 610, pillX: 630, pillY: 151, textX: 680,
    },
    {
      body: '198,241 482,241 412,326 268,326', top: '198,241 482,241 476,253 204,253',
      fill: '#5B7FFF', topFill: '#7DA0FF',
      lineX1: 490, lineY: 280, dotX: 560, pillX: 580, pillY: 256, textX: 630,
    },
    {
      body: '268,332 412,332 372,400 308,400', top: '268,332 412,332 406,344 274,344',
      fill: '#3B82F6', topFill: '#5B7FFF',
      lineX1: 420, lineY: 366, dotX: 490, pillX: 510, pillY: 342, textX: 560,
    },
    {
      body: '308,406 372,406 372,488 308,462', top: '308,406 372,406 372,418 308,418',
      fill: '#2563EB', topFill: '#3B82F6',
      lineX1: 402, lineY: 431, dotX: 472, pillX: 492, pillY: 407, textX: 542,
    },
  ]

  return (
    <div className="h-full w-full">
      <svg viewBox="140 140 600 358" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Dégradé de balayage (userSpaceOnUse) : on anime le gradient, pas la forme */}
          <linearGradient id="funnelShine" gradientUnits="userSpaceOnUse" x1="150" y1="0" x2="270" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            <animate attributeName="x1" values="150;500" dur="1.1s" repeatCount="indefinite" />
            <animate attributeName="x2" values="270;620" dur="1.1s" repeatCount="indefinite" />
          </linearGradient>
        </defs>

        {steps.map((s, i) => {
          const tier = tiers[i]
          if (!tier) return null
          const isActive = active === i
          return (
            <g
              key={i}
              className="cursor-pointer"
              style={{ transition: 'opacity 200ms ease' }}
              opacity={active === null || isActive ? 1 : 0.45}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive((cur) => (cur === i ? null : i))}
            >
              {/* Trapèze + liseré clair. 1er étage : coins supérieurs arrondis. */}
              {i === 0 ? (
                <>
                  <path d="M 162,150 L 518,150 A 12 12 0 0 1 530,162 L 482,235 L 198,235 L 150,162 A 12 12 0 0 1 162,150 Z" fill={tier.fill} />
                  <polygon points={tier.top} fill={tier.topFill} opacity={0.7} />
                </>
              ) : (
                <>
                  <polygon points={tier.body} fill={tier.fill} />
                  <polygon points={tier.top} fill={tier.topFill} opacity={0.7} />
                </>
              )}

              {/* Surbrillance pulsée + balayage lumineux quand actif */}
              {isActive && (
                <>
                  <polygon points={tier.body} fill="#ffffff" opacity={0.18}>
                    <animate attributeName="opacity" values="0.05;0.28;0.05" dur="1.4s" repeatCount="indefinite" />
                  </polygon>
                  <polygon points={tier.body} fill="url(#funnelShine)" />
                </>
              )}

              {/* Étiquette : ligne + point + pill */}
              <line x1={tier.lineX1} y1={tier.lineY} x2={tier.dotX} y2={tier.lineY} stroke={isActive ? '#3B82F6' : '#2A3645'} strokeWidth="2" />
              <circle cx={tier.dotX} cy={tier.lineY} r={isActive ? 7 : 6} fill="#3B82F6" />
              <rect
                x={tier.pillX} y={tier.pillY} width="100" height="48" rx="10"
                fill="#1A2433" stroke={isActive ? '#3B82F6' : '#2A3645'} strokeWidth={isActive ? 1.5 : 1}
                style={{ transition: 'stroke 200ms ease' }}
              />
              <text x={tier.textX} y={tier.pillY + 22} fill="#8A95A5" fontSize="13" fontWeight="400" textAnchor="middle">{s.label}</text>
              <text x={tier.textX} y={tier.pillY + 39} fill="#3B82F6" fontSize="16" fontWeight="700" textAnchor="middle">{s.value.toLocaleString('fr-FR')}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
