'use client'

import { Users } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

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

export function MultiTeamSelect({
  teams,
  selectedTeamIds,
  onTeamIdsChange,
  label = 'Équipes',
  description = 'Les membres des équipes sélectionnées pourront accéder à cette ressource selon leurs permissions.',
  emptyDescription = 'Cette ressource est uniquement accessible par vous.',
}: MultiTeamSelectProps) {
  const handleTeamToggle = (teamId: string, checked: boolean) => {
    if (checked) {
      onTeamIdsChange([...selectedTeamIds, teamId])
    } else {
      onTeamIdsChange(selectedTeamIds.filter((id) => id !== teamId))
    }
  }

  return (
    <div className="space-y-3">
      {label && <Label>{label}</Label>}

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Vous n&apos;êtes membre d&apos;aucune équipe.
        </p>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center space-x-3">
              <Checkbox
                id={`team-${team.id}`}
                checked={selectedTeamIds.includes(team.id)}
                onCheckedChange={(checked) =>
                  handleTeamToggle(team.id, checked === true)
                }
              />
              <label
                htmlFor={`team-${team.id}`}
                className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {team.name}
              </label>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {selectedTeamIds.length > 0 ? description : emptyDescription}
      </p>
    </div>
  )
}
