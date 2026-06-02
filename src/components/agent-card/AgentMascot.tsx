'use client'

/**
 * AgentMascot — petite mascotte "blob" douce (style 3D soft / Fall Guys).
 * Corps en forme de goutte arrondie, deux yeux, petits pieds.
 * La teinte s'adapte via la prop `color` (utilisée pour les pieds + ombrage).
 */
export function AgentMascot({ color = '#7DC2A5', size = 120 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dégradé du corps : blanc en haut → légère teinte en bas */}
        <linearGradient id={`mascot-body-${color}`} x1="60" y1="14" x2="60" y2="118" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="78%" stopColor="#f4f7fb" />
          <stop offset="100%" stopColor={color} stopOpacity="0.22" />
        </linearGradient>
        {/* Ombre douce sous le corps */}
        <radialGradient id={`mascot-shadow-${color}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ombre au sol */}
      <ellipse cx="60" cy="122" rx="34" ry="7" fill={`url(#mascot-shadow-${color})`} />

      {/* Pieds */}
      <ellipse cx="46" cy="112" rx="9" ry="11" fill={color} />
      <ellipse cx="74" cy="112" rx="9" ry="11" fill={color} />
      <ellipse cx="46" cy="110" rx="9" ry="9" fill={color} opacity="0.85" />
      <ellipse cx="74" cy="110" rx="9" ry="9" fill={color} opacity="0.85" />

      {/* Corps en goutte : large en bas, pointe arrondie en haut */}
      <path
        d="M60 16
           C 44 16, 33 34, 33 62
           C 33 92, 44 110, 60 110
           C 76 110, 87 92, 87 62
           C 87 34, 76 16, 60 16 Z"
        fill={`url(#mascot-body-${color})`}
        stroke={color}
        strokeOpacity="0.15"
        strokeWidth="1.5"
      />

      {/* Reflet/brillance sur le corps */}
      <ellipse cx="50" cy="44" rx="9" ry="14" fill="#ffffff" opacity="0.6" />

      {/* Yeux */}
      <ellipse cx="51" cy="64" rx="4.5" ry="6" fill="#1a1a2e" />
      <ellipse cx="69" cy="64" rx="4.5" ry="6" fill="#1a1a2e" />
      {/* Reflets dans les yeux */}
      <circle cx="52.5" cy="61.5" r="1.6" fill="#ffffff" />
      <circle cx="70.5" cy="61.5" r="1.6" fill="#ffffff" />

      {/* Petites joues colorées */}
      <ellipse cx="42" cy="72" rx="4" ry="2.5" fill={color} opacity="0.3" />
      <ellipse cx="78" cy="72" rx="4" ry="2.5" fill={color} opacity="0.3" />
    </svg>
  )
}
