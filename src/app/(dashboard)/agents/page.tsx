'use client'

import { useEffect, useState, useCallback } from 'react'
import type { AIAgent, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Bot,
  Trash2,
  Pencil,
  Loader2,
  Brain,
  Clock,
  Languages,
  Users,
  ShieldAlert,
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

export default function AgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AIAgent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [agentToDelete, setAgentToDelete] = useState<AIAgent | null>(null)
  const [teams, setTeams] = useState<TeamWithRole[]>([])

  // Form state
  const [formTeamId, setFormTeamId] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSystemPrompt, setFormSystemPrompt] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [formTemperature, setFormTemperature] = useState('0.7')
  const [formDelayMin, setFormDelayMin] = useState('0')
  const [formDelayMax, setFormDelayMax] = useState('0')
  const [formMaxMessages, setFormMaxMessages] = useState('')
  const [formInactivityTimeout, setFormInactivityTimeout] = useState('')

  // Schedule form state
  const [formScheduleEnabled, setFormScheduleEnabled] = useState(false)
  const [formScheduleTimezone, setFormScheduleTimezone] = useState('Europe/Paris')
  const [formScheduleStartTime, setFormScheduleStartTime] = useState('09:00')
  const [formScheduleEndTime, setFormScheduleEndTime] = useState('18:00')
  const [formScheduleDays, setFormScheduleDays] = useState<number[]>([1, 2, 3, 4, 5])

  // Language detection
  const [formAutoDetectLanguage, setFormAutoDetectLanguage] = useState(false)

  // Escalation (garde-fou)
  const [formEscalationEnabled, setFormEscalationEnabled] = useState(false)
  const [formEscalationKeywords, setFormEscalationKeywords] = useState('')
  const [formEscalationMessage, setFormEscalationMessage] = useState('')

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des agents')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams(json.data.filter((t: TeamWithRole) => t.my_role === 'owner' || t.my_role === 'admin'))
      }
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchTeams()
  }, [fetchAgents, fetchTeams])

  function openCreateDialog() {
    setEditing(null)
    setFormTeamId('')
    setFormName('')
    setFormDescription('')
    setFormSystemPrompt('')
    setFormObjective('')
    setFormModel('gpt-4o-mini')
    setFormTemperature('0.7')
    setFormDelayMin('0')
    setFormDelayMax('0')
    setFormMaxMessages('')
    setFormInactivityTimeout('')
    setFormScheduleEnabled(false)
    setFormScheduleTimezone('Europe/Paris')
    setFormScheduleStartTime('09:00')
    setFormScheduleEndTime('18:00')
    setFormScheduleDays([1, 2, 3, 4, 5])
    setFormAutoDetectLanguage(false)
    setFormEscalationEnabled(false)
    setFormEscalationKeywords('')
    setFormEscalationMessage('')
    setDialogOpen(true)
  }

  function openEditDialog(agent: AIAgent) {
    setEditing(agent)
    setFormTeamId(agent.team_id || '')
    setFormName(agent.name)
    setFormDescription(agent.description || '')
    setFormSystemPrompt(agent.system_prompt)
    setFormObjective(agent.objective || '')
    setFormModel(agent.model)
    setFormTemperature(String(agent.temperature))
    setFormDelayMin(String(agent.response_delay_min ?? 0))
    setFormDelayMax(String(agent.response_delay_max ?? 0))
    setFormMaxMessages(agent.max_messages_per_conversation != null ? String(agent.max_messages_per_conversation) : '')
    setFormInactivityTimeout(agent.inactivity_timeout_minutes != null ? String(agent.inactivity_timeout_minutes) : '')
    setFormScheduleEnabled(agent.schedule_enabled ?? false)
    setFormScheduleTimezone(agent.schedule_timezone ?? 'Europe/Paris')
    setFormScheduleStartTime(agent.schedule_start_time ?? '09:00')
    setFormScheduleEndTime(agent.schedule_end_time ?? '18:00')
    setFormScheduleDays(agent.schedule_days ?? [1, 2, 3, 4, 5])
    setFormAutoDetectLanguage(agent.auto_detect_language ?? false)
    setFormEscalationEnabled(agent.escalation_enabled ?? false)
    setFormEscalationKeywords(agent.escalation_keywords?.join(', ') ?? '')
    setFormEscalationMessage(agent.escalation_message ?? '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formSystemPrompt.trim()) {
      toast.error('Nom et prompt système sont requis')
      return
    }

    const temp = parseFloat(formTemperature)
    if (isNaN(temp) || temp < 0 || temp > 2) {
      toast.error('La température doit être entre 0 et 2')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/agents/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
            max_messages_per_conversation: formMaxMessages.trim() ? parseInt(formMaxMessages) : null,
            inactivity_timeout_minutes: formInactivityTimeout.trim() ? parseInt(formInactivityTimeout) : null,
            schedule_enabled: formScheduleEnabled,
            schedule_timezone: formScheduleTimezone,
            schedule_start_time: formScheduleStartTime,
            schedule_end_time: formScheduleEndTime,
            schedule_days: formScheduleDays,
            auto_detect_language: formAutoDetectLanguage,
            escalation_enabled: formEscalationEnabled,
            escalation_keywords: formEscalationKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
            escalation_message: formEscalationMessage.trim() || null,
            team_id: formTeamId || null,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setAgents((prev) => prev.map((a) => (a.id === editing.id ? json.data : a)))
          toast.success('Agent modifié')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la modification')
        }
      } else {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
            max_messages_per_conversation: formMaxMessages.trim() ? parseInt(formMaxMessages) : null,
            inactivity_timeout_minutes: formInactivityTimeout.trim() ? parseInt(formInactivityTimeout) : null,
            schedule_enabled: formScheduleEnabled,
            schedule_timezone: formScheduleTimezone,
            schedule_start_time: formScheduleStartTime,
            schedule_end_time: formScheduleEndTime,
            schedule_days: formScheduleDays,
            auto_detect_language: formAutoDetectLanguage,
            escalation_enabled: formEscalationEnabled,
            escalation_keywords: formEscalationKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
            escalation_message: formEscalationMessage.trim() || null,
            team_id: formTeamId || null,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setAgents((prev) => [json.data, ...prev])
          toast.success('Agent créé')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la création')
        }
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  function openDeleteDialog(agent: AIAgent) {
    setAgentToDelete(agent)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!agentToDelete) return
    setDeleting(agentToDelete.id)
    try {
      const res = await fetch(`/api/agents/${agentToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id))
        toast.success('Agent supprimé')
        setDeleteDialogOpen(false)
        setAgentToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleActive(agent: AIAgent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !agent.is_active }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? json.data : a)))
        toast.success(json.data.is_active ? 'Agent activé' : 'Agent désactivé')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Agents IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez des agents intelligents pour répondre automatiquement sur WhatsApp.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nouvel agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez votre premier agent IA pour automatiser vos réponses WhatsApp.
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Créer un agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const isDeleting = deleting === agent.id

            return (
              <Card key={agent.id} className={!agent.is_active ? 'opacity-60' : ''}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    <Bot className="mr-1 inline h-4 w-4" />
                    {agent.name}
                  </CardTitle>
                  <Badge variant={agent.is_active ? 'default' : 'secondary'} className="w-fit">
                    {agent.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {agent.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {agent.team_id && (
                        <Badge variant="outline" className="gap-1 text-xs font-normal">
                          <Users className="h-3 w-3" />
                          {teams.find(t => t.id === agent.team_id)?.name || 'Équipe'}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {agent.model}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        T° {agent.temperature}
                      </span>
                      {(agent.response_delay_min > 0 || agent.response_delay_max > 0) && (
                        <span className="text-xs text-muted-foreground">
                          Délai {agent.response_delay_min}–{agent.response_delay_max}s
                        </span>
                      )}
                      {agent.max_messages_per_conversation != null && (
                        <span className="text-xs text-muted-foreground">
                          Max {agent.max_messages_per_conversation} msg
                        </span>
                      )}
                      {agent.inactivity_timeout_minutes != null && (
                        <span className="text-xs text-muted-foreground">
                          Timeout {agent.inactivity_timeout_minutes}min
                        </span>
                      )}
                      {agent.schedule_enabled && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {agent.schedule_start_time}–{agent.schedule_end_time}
                        </span>
                      )}
                      {agent.auto_detect_language && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Languages className="h-3 w-3" />
                          Multi-langue
                        </span>
                      )}
                      {agent.escalation_enabled && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <ShieldAlert className="h-3 w-3" />
                          Garde-fou
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {agent.system_prompt}
                    </p>

                    {agent.objective && (
                      <p className="text-xs text-muted-foreground truncate">
                        Objectif : {agent.objective}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(agent)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(agent)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Supprimer
                    </Button>
                    <div className="ml-auto">
                      <Switch
                        checked={agent.is_active}
                        onCheckedChange={() => handleToggleActive(agent)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\'agent' : 'Nouvel agent IA'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifiez les paramètres de votre agent.'
                : 'Configurez un agent IA pour répondre automatiquement sur WhatsApp.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="agent-team">Équipe</Label>
              <Select value={formTeamId || 'personal'} onValueChange={(v) => setFormTeamId(v === 'personal' ? '' : v)}>
                <SelectTrigger id="agent-team">
                  <SelectValue placeholder="Agent personnel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Agent personnel</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        {team.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formTeamId
                  ? 'Les membres de l\'équipe pourront utiliser cet agent.'
                  : 'Cet agent est uniquement accessible par vous.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-name">Nom *</Label>
              <Input
                id="agent-name"
                placeholder="Ex: Support Client"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <Textarea
                id="agent-description"
                placeholder="Ex: Agent de support pour répondre aux questions fréquentes"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt">Prompt système *</Label>
              <Textarea
                id="agent-prompt"
                placeholder="Ex: Tu es un assistant de support client pour l'entreprise X. Tu réponds de manière professionnelle et concise aux questions des clients..."
                value={formSystemPrompt}
                onChange={(e) => setFormSystemPrompt(e.target.value)}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Instructions données à l&apos;IA pour définir son comportement et sa personnalité.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-objective">Objectif</Label>
              <Input
                id="agent-objective"
                placeholder="Ex: Qualifier les leads et prendre des rendez-vous"
                value={formObjective}
                onChange={(e) => setFormObjective(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent-model">Modèle</Label>
                <Select value={formModel} onValueChange={setFormModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-temperature">Température</Label>
                <Input
                  id="agent-temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={formTemperature}
                  onChange={(e) => setFormTemperature(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  0 = précis, 2 = créatif
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Délai de réponse (secondes)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="agent-delay-min" className="text-xs text-muted-foreground">Minimum</Label>
                  <Input
                    id="agent-delay-min"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMin}
                    onChange={(e) => setFormDelayMin(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="agent-delay-max" className="text-xs text-muted-foreground">Maximum</Label>
                  <Input
                    id="agent-delay-max"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMax}
                    onChange={(e) => setFormDelayMax(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Délai aléatoire entre min et max avant de répondre. Regroupe les messages
                consécutifs et simule un comportement humain. 0/0 = réponse immédiate.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Limites de conversation</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="agent-max-messages" className="text-xs text-muted-foreground">
                    Messages max / conversation
                  </Label>
                  <Input
                    id="agent-max-messages"
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    placeholder="Illimité"
                    value={formMaxMessages}
                    onChange={(e) => setFormMaxMessages(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agent-inactivity" className="text-xs text-muted-foreground">
                    Timeout inactivité (min)
                  </Label>
                  <Input
                    id="agent-inactivity"
                    type="number"
                    min={1}
                    max={10080}
                    step={1}
                    placeholder="Désactivé"
                    value={formInactivityTimeout}
                    onChange={(e) => setFormInactivityTimeout(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                L&apos;agent arrête de répondre après N messages ou si la conversation est
                inactive depuis X minutes. Laisser vide = pas de limite.
              </p>
            </div>

            {/* Schedule Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Horaires d&apos;activité
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Limiter l&apos;agent à certaines plages horaires
                  </p>
                </div>
                <Switch
                  checked={formScheduleEnabled}
                  onCheckedChange={setFormScheduleEnabled}
                />
              </div>

              {formScheduleEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-1">
                    <Label htmlFor="schedule-timezone" className="text-xs text-muted-foreground">
                      Fuseau horaire
                    </Label>
                    <Select value={formScheduleTimezone} onValueChange={setFormScheduleTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                        <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                        <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                        <SelectItem value="Africa/Casablanca">Africa/Casablanca (WET)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="schedule-start" className="text-xs text-muted-foreground">
                        Heure de début
                      </Label>
                      <Input
                        id="schedule-start"
                        type="time"
                        value={formScheduleStartTime}
                        onChange={(e) => setFormScheduleStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="schedule-end" className="text-xs text-muted-foreground">
                        Heure de fin
                      </Label>
                      <Input
                        id="schedule-end"
                        type="time"
                        value={formScheduleEndTime}
                        onChange={(e) => setFormScheduleEndTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Jours actifs</Label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { day: 1, label: 'Lun' },
                        { day: 2, label: 'Mar' },
                        { day: 3, label: 'Mer' },
                        { day: 4, label: 'Jeu' },
                        { day: 5, label: 'Ven' },
                        { day: 6, label: 'Sam' },
                        { day: 0, label: 'Dim' },
                      ].map(({ day, label }) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={formScheduleDays.includes(day) ? 'default' : 'outline'}
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setFormScheduleDays((prev) =>
                              prev.includes(day)
                                ? prev.filter((d) => d !== day)
                                : [...prev, day]
                            )
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Language Detection Section */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Languages className="h-4 w-4" />
                  Détection de langue
                </Label>
                <p className="text-xs text-muted-foreground">
                  Répond automatiquement dans la langue de l&apos;utilisateur
                </p>
              </div>
              <Switch
                checked={formAutoDetectLanguage}
                onCheckedChange={setFormAutoDetectLanguage}
              />
            </div>

            {/* Escalation Section (Garde-fou) */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Garde-fou (Escalation)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Désactive l&apos;IA si le client est contrarié
                  </p>
                </div>
                <Switch
                  checked={formEscalationEnabled}
                  onCheckedChange={setFormEscalationEnabled}
                />
              </div>

              {formEscalationEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-1">
                    <Label htmlFor="escalation-keywords" className="text-xs text-muted-foreground">
                      Mots-clés déclencheurs (séparés par virgule)
                    </Label>
                    <Textarea
                      id="escalation-keywords"
                      placeholder="parler à un humain, énervé, remboursement, plainte..."
                      value={formEscalationKeywords}
                      onChange={(e) => setFormEscalationKeywords(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      L&apos;IA sera désactivée si l&apos;un de ces mots-clés est détecté dans le message du client.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="escalation-message" className="text-xs text-muted-foreground">
                      Message d&apos;escalation (optionnel)
                    </Label>
                    <Textarea
                      id="escalation-message"
                      placeholder="Je comprends votre frustration. Un conseiller va prendre le relais..."
                      value={formEscalationMessage}
                      onChange={(e) => setFormEscalationMessage(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Ce message sera envoyé au client avant de désactiver l&apos;IA.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formSystemPrompt.trim()}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Enregistrer' : 'Créer l\'agent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setAgentToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Supprimer l'agent"
        description={`Êtes-vous sûr de vouloir supprimer l'agent "${agentToDelete?.name}" ? Cette action est irréversible.`}
        loading={deleting === agentToDelete?.id}
      />
    </div>
  )
}
