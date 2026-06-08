'use client'

/**
 * ⚠️ SYSTÈME D'ÉQUIPES RETIRÉ (refonte V2).
 *
 * Stub conservant la signature des props pour ne pas casser les pages
 * qui l'importent encore. Ne rend plus rien (les ressources sont
 * désormais scopées par utilisateur uniquement).
 */

export type TeamOption = {
  id: string
  name: string
}

interface MultiTeamSelectProps {
  teams: TeamOption[]
  selectedTeamIds: string[]
  onTeamIdsChange: (teamIds: string[]) => void
  label?: string
  description?: string
  emptyDescription?: string
}

export function MultiTeamSelect(_props: MultiTeamSelectProps) {
  return null
}
