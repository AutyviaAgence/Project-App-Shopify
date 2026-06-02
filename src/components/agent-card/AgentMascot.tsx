'use client'

/**
 * AgentMascot — petite mascotte "blob" douce (style 3D soft, type Fall Guys).
 * Forme trapue : base large, sommet arrondi en pointe douce (goutte/montagne).
 * Yeux dans le tiers bas, petits pieds écartés. Teinte via la prop `color`.
 */
export function AgentMascot({ color = '#7DC2A5', size = 120 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Corps : blanc en haut, très légère teinte froide en bas */}
        <linearGradient id={`mb-${color}`} x1="70" y1="18" x2="70" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#eef2f7" />
          <stop offset="100%" stopColor="#d8e2ee" />
        </linearGradient>
        <radialGradient id={`ms-${color}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ombre au sol */}
      <ellipse cx="70" cy="127" rx="42" ry="8" fill={`url(#ms-${color})`} />

      {/* Pieds — larges, écartés, sous la base */}
      <ellipse cx="50" cy="117" rx="13" ry="9" fill={color} />
      <ellipse cx="90" cy="117" rx="13" ry="9" fill={color} />
      <ellipse cx="47" cy="114" rx="5" ry="3" fill="#ffffff" opacity="0.35" />
      <ellipse cx="87" cy="114" rx="5" ry="3" fill="#ffffff" opacity="0.35" />

      {/* Corps en goutte : pointe arrondie effilée en haut, base très large */}
      <path
        d="M70 18
           C 60 18, 52 32, 46 58
           C 40 84, 34 106, 50 115
           C 60 119, 80 119, 90 115
           C 106 106, 100 84, 94 58
           C 88 32, 80 18, 70 18 Z"
        fill={`url(#mb-${color})`}
      />

      {/* Reflet de brillance (haut-gauche) */}
      <ellipse cx="55" cy="50" rx="9" ry="15" fill="#ffffff" opacity="0.5" transform="rotate(-14 55 50)" />

      {/* Yeux — ovales noirs, rapprochés, dans le tiers bas */}
      <ellipse cx="60" cy="84" rx="5.5" ry="7.5" fill="#16161e" />
      <ellipse cx="80" cy="84" rx="5.5" ry="7.5" fill="#16161e" />
      <circle cx="62" cy="80.5" r="2" fill="#ffffff" />
      <circle cx="82" cy="80.5" r="2" fill="#ffffff" />

      {/* Joues colorées */}
      <ellipse cx="49" cy="93" rx="5" ry="3" fill={color} opacity="0.35" />
      <ellipse cx="91" cy="93" rx="5" ry="3" fill={color} opacity="0.35" />
    </svg>
  )
}
