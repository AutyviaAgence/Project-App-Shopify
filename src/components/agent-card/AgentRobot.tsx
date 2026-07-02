'use client'

// Illustration robot SVG simple et sympathique
// La couleur s'adapte via la prop `color`
export function AgentRobot({ color = '#7DC2A5', size = 120 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Antenne */}
      <rect x="58" y="4" width="4" height="14" rx="2" fill={color} opacity="0.7" />
      <circle cx="60" cy="4" r="5" fill={color} />

      {/* Tête */}
      <rect x="20" y="18" width="80" height="58" rx="16" fill={color} opacity="0.15" />
      <rect x="20" y="18" width="80" height="58" rx="16" stroke={color} strokeWidth="2.5" />

      {/* Yeux */}
      <rect x="34" y="34" width="20" height="14" rx="7" fill={color} />
      <rect x="66" y="34" width="20" height="14" rx="7" fill={color} />
      {/* Reflet yeux */}
      <circle cx="40" cy="39" r="3" fill="white" opacity="0.6" />
      <circle cx="72" cy="39" r="3" fill="white" opacity="0.6" />

      {/* Bouche — sourire */}
      <path
        d="M40 58 Q60 70 80 58"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Corps */}
      <rect x="30" y="82" width="60" height="32" rx="12" fill={color} opacity="0.15" stroke={color} strokeWidth="2.5" />

      {/* Bouton corps */}
      <circle cx="60" cy="98" r="5" fill={color} opacity="0.5" />

      {/* Bras gauche */}
      <rect x="10" y="86" width="18" height="10" rx="5" fill={color} opacity="0.4" stroke={color} strokeWidth="2" />

      {/* Bras droit */}
      <rect x="92" y="86" width="18" height="10" rx="5" fill={color} opacity="0.4" stroke={color} strokeWidth="2" />

      {/* Jambes */}
      <rect x="38" y="114" width="16" height="6" rx="3" fill={color} opacity="0.5" />
      <rect x="66" y="114" width="16" height="6" rx="3" fill={color} opacity="0.5" />
    </svg>
  )
}

// Couleurs par template d'agent
export const AGENT_COLORS: Record<string, string> = {
  support: '#3b82f6',
  booking: '#06b6d4',
  leads: '#8b5cf6',
  sales: '#f97316',
  default: '#7DC2A5',
}

export function getAgentColor(description: string | null, primaryColor?: string): string {
  if (!description) return primaryColor || AGENT_COLORS.default
  const lower = description.toLowerCase()
  if (lower.includes('support')) return AGENT_COLORS.support
  if (lower.includes('rdv') || lower.includes('rendez')) return AGENT_COLORS.booking
  if (lower.includes('qualif') || lower.includes('lead')) return AGENT_COLORS.leads
  if (lower.includes('vente') || lower.includes('sales')) return AGENT_COLORS.sales
  return primaryColor || AGENT_COLORS.default
}
