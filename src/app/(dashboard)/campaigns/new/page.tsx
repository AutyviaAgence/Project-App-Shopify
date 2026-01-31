'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { AIAgent, WhatsAppSession, ConversationTag, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2,
  ArrowLeft,
  Megaphone,
  Bot,
  MessageSquare,
  Filter,
  Shield,
  Clock,
  Users,
  Tag,
  Link2,
  Calendar,
  AlertTriangle,
} from 'lucide-react'

type AgentWithType = AIAgent & { agent_type?: 'conversation' | 'relance' }
type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  // Options
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AgentWithType[]>([])
  const [tags, setTags] = useState<ConversationTag[]>([])
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [trackingSources, setTrackingSources] = useState<string[]>([])

  // Form state
  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState<string>('')
  const [useAgent, setUseAgent] = useState(true)
  const [agentId, setAgentId] = useState<string>('')
  const [messageTemplate, setMessageTemplate] = useState('')

  // Filters
  const [filterSessionIds, setFilterSessionIds] = useState<string[]>([])
  const [filterTrackingSources, setFilterTrackingSources] = useState<string[]>([])
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterInactivityDays, setFilterInactivityDays] = useState<number>(7)
  const [filterExcludeReplied, setFilterExcludeReplied] = useState(false)

  // Anti-ban limits
  const [maxRecipients, setMaxRecipients] = useState(50)
  const [delayBetweenMin, setDelayBetweenMin] = useState(30)
  const [delayBetweenMax, setDelayBetweenMax] = useState(120)
  const [messagesPerHour, setMessagesPerHour] = useState(20)
  const [sendHourStart, setSendHourStart] = useState(9)
  const [sendHourEnd, setSendHourEnd] = useState(21)
  const [minDaysSinceLastCampaign, setMinDaysSinceLastCampaign] = useState(7)

  // Schedule
  const [scheduledAt, setScheduledAt] = useState<string>('')

  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, agentsRes, tagsRes, teamsRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/agents'),
        fetch('/api/tags'),
        fetch('/api/teams'),
      ])

      const [sessionsJson, agentsJson, tagsJson, teamsJson] = await Promise.all([
        sessionsRes.json(),
        agentsRes.json(),
        tagsRes.json(),
        teamsRes.json(),
      ])

      if (sessionsJson.data) setSessions(sessionsJson.data)
      if (agentsJson.data) {
        // Filtrer pour ne garder que les agents de type 'relance'
        const relanceAgents = agentsJson.data.filter(
          (a: AgentWithType) => a.agent_type === 'relance'
        )
        setAgents(relanceAgents)
      }
      if (tagsJson.data) setTags(tagsJson.data)
      if (teamsJson.data) {
        setTeams(teamsJson.data.filter((t: TeamWithRole) => t.my_role === 'owner' || t.my_role === 'admin'))
      }

      // Récupérer les sources de tracking uniques
      const sourcesRes = await fetch('/api/conversations?tracking_sources=true')
      const sourcesJson = await sourcesRes.json()
      if (sourcesJson.tracking_sources) {
        setTrackingSources(sourcesJson.tracking_sources)
      }
    } catch {
      toast.error('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handlePreview() {
    if (!name.trim()) {
      toast.error('Veuillez entrer un nom de campagne')
      return
    }

    setPreviewing(true)
    try {
      // Créer temporairement la campagne pour prévisualiser
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          team_id: teamId || null,
          relance_agent_id: useAgent && agentId ? agentId : null,
          message_template: !useAgent ? messageTemplate : null,
          filter_session_ids: filterSessionIds.length > 0 ? filterSessionIds : null,
          filter_tracking_sources: filterTrackingSources.length > 0 ? filterTrackingSources : null,
          filter_tag_ids: filterTagIds.length > 0 ? filterTagIds : null,
          filter_inactivity_days: filterInactivityDays,
          filter_exclude_replied: filterExcludeReplied,
          max_recipients: maxRecipients,
          delay_between_min: delayBetweenMin,
          delay_between_max: delayBetweenMax,
          messages_per_hour: messagesPerHour,
          send_hour_start: sendHourStart,
          send_hour_end: sendHourEnd,
          min_days_since_last_campaign: minDaysSinceLastCampaign,
          scheduled_at: scheduledAt || null,
        }),
      })

      const createJson = await createRes.json()
      if (!createRes.ok) {
        toast.error(createJson.error || 'Erreur lors de la création')
        return
      }

      // Prévisualiser
      const previewRes = await fetch(`/api/campaigns/${createJson.data.id}/preview`)
      const previewJson = await previewRes.json()

      if (previewRes.ok && previewJson.data) {
        setPreviewCount(previewJson.data.eligible_count)

        if (previewJson.data.eligible_count > 0) {
          // Ajouter les destinataires
          const addRes = await fetch(`/api/campaigns/${createJson.data.id}/preview`, {
            method: 'POST',
          })
          const addJson = await addRes.json()

          if (addRes.ok) {
            toast.success(`${addJson.data.added_count} contacts éligibles ajoutés`)
            router.push(`/campaigns/${createJson.data.id}`)
          } else {
            toast.error(addJson.error || 'Erreur lors de l\'ajout des contacts')
          }
        } else {
          toast.warning('Aucun contact éligible avec ces critères')
          // Supprimer la campagne vide
          await fetch(`/api/campaigns/${createJson.data.id}`, { method: 'DELETE' })
        }
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Le nom est requis')
      return
    }

    if (useAgent && !agentId) {
      toast.error('Veuillez sélectionner un agent de relance')
      return
    }

    if (!useAgent && !messageTemplate.trim()) {
      toast.error('Le message template est requis')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          team_id: teamId || null,
          relance_agent_id: useAgent && agentId ? agentId : null,
          message_template: !useAgent ? messageTemplate : null,
          filter_session_ids: filterSessionIds.length > 0 ? filterSessionIds : null,
          filter_tracking_sources: filterTrackingSources.length > 0 ? filterTrackingSources : null,
          filter_tag_ids: filterTagIds.length > 0 ? filterTagIds : null,
          filter_inactivity_days: filterInactivityDays,
          filter_exclude_replied: filterExcludeReplied,
          max_recipients: maxRecipients,
          delay_between_min: delayBetweenMin,
          delay_between_max: delayBetweenMax,
          messages_per_hour: messagesPerHour,
          send_hour_start: sendHourStart,
          send_hour_end: sendHourEnd,
          min_days_since_last_campaign: minDaysSinceLastCampaign,
          scheduled_at: scheduledAt || null,
        }),
      })

      const json = await res.json()
      if (res.ok && json.data) {
        toast.success('Campagne créée')
        router.push(`/campaigns/${json.data.id}`)
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const relanceAgents = agents.filter(a => a.agent_type === 'relance')

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Nouvelle campagne</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurez une campagne de relance pour vos contacts inactifs.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Info de base */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5" />
              Informations générales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de la campagne *</Label>
              <Input
                id="name"
                placeholder="Ex: Relance clients janvier"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {teams.length > 0 && (
              <div className="space-y-2">
                <Label>Équipe (optionnel)</Label>
                <Select value={teamId || 'none'} onValueChange={(v) => setTeamId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucune équipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune équipe</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Message de relance
            </CardTitle>
            <CardDescription>
              Utilisez un agent IA pour personnaliser chaque message, ou un template fixe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Utiliser un agent IA
              </Label>
              <Switch checked={useAgent} onCheckedChange={setUseAgent} />
            </div>

            {useAgent ? (
              <div className="space-y-2">
                <Label>Agent de relance</Label>
                {relanceAgents.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    <p className="text-sm text-muted-foreground">
                      Aucun agent de type &quot;relance&quot; disponible.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Créez un agent avec le type &quot;relance&quot; dans la page Agents IA.
                    </p>
                  </div>
                ) : (
                  <Select value={agentId} onValueChange={setAgentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {relanceAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="template">Message template *</Label>
                <Textarea
                  id="template"
                  placeholder="Bonjour ! Cela fait un moment que nous n'avons pas échangé..."
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Ce message sera envoyé identique à tous les contacts.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filtres de ciblage
            </CardTitle>
            <CardDescription>
              Définissez les critères pour sélectionner les contacts à relancer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sessions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Sessions WhatsApp
              </Label>
              <div className="flex flex-wrap gap-2">
                {sessions.map((session) => (
                  <Badge
                    key={session.id}
                    variant={filterSessionIds.includes(session.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      setFilterSessionIds((prev) =>
                        prev.includes(session.id)
                          ? prev.filter((id) => id !== session.id)
                          : [...prev, session.id]
                      )
                    }}
                  >
                    {session.instance_name}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Laisser vide = toutes les sessions accessibles
              </p>
            </div>

            {/* Tracking sources */}
            {trackingSources.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Sources de tracking
                </Label>
                <div className="flex flex-wrap gap-2">
                  {trackingSources.map((source) => (
                    <Badge
                      key={source}
                      variant={filterTrackingSources.includes(source) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        setFilterTrackingSources((prev) =>
                          prev.includes(source)
                            ? prev.filter((s) => s !== source)
                            : [...prev, source]
                        )
                      }}
                    >
                      {source}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags de conversation
                </Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={filterTagIds.includes(tag.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      style={{ backgroundColor: filterTagIds.includes(tag.id) ? tag.color : undefined }}
                      onClick={() => {
                        setFilterTagIds((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((id) => id !== tag.id)
                            : [...prev, tag.id]
                        )
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Inactivity */}
            <div className="space-y-2">
              <Label>Inactivité minimum : {filterInactivityDays} jours</Label>
              <Slider
                value={[filterInactivityDays]}
                onValueChange={([value]) => setFilterInactivityDays(value)}
                min={1}
                max={90}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Contacts sans message depuis au moins {filterInactivityDays} jours
              </p>
            </div>

            {/* Exclude replied */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Exclure ceux qui ont répondu</Label>
                <p className="text-xs text-muted-foreground">
                  N&apos;inclure que les contacts qui n&apos;ont pas répondu
                </p>
              </div>
              <Switch checked={filterExcludeReplied} onCheckedChange={setFilterExcludeReplied} />
            </div>
          </CardContent>
        </Card>

        {/* Limites anti-ban */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Protection anti-ban
            </CardTitle>
            <CardDescription>
              Limites pour éviter le blocage par WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Destinataires max : {maxRecipients}</Label>
                <Slider
                  value={[maxRecipients]}
                  onValueChange={([value]) => setMaxRecipients(value)}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>

              <div className="space-y-2">
                <Label>Messages/heure : {messagesPerHour}</Label>
                <Slider
                  value={[messagesPerHour]}
                  onValueChange={([value]) => setMessagesPerHour(value)}
                  min={5}
                  max={60}
                  step={5}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Délai entre messages : {delayBetweenMin}–{delayBetweenMax} secondes</Label>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    type="number"
                    value={delayBetweenMin}
                    onChange={(e) => setDelayBetweenMin(parseInt(e.target.value) || 30)}
                    min={10}
                    max={300}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    value={delayBetweenMax}
                    onChange={(e) => setDelayBetweenMax(parseInt(e.target.value) || 120)}
                    min={30}
                    max={600}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Plage horaire d&apos;envoi
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={sendHourStart}
                  onChange={(e) => setSendHourStart(parseInt(e.target.value) || 9)}
                  min={0}
                  max={23}
                  className="w-20"
                />
                <span>h à</span>
                <Input
                  type="number"
                  value={sendHourEnd}
                  onChange={(e) => setSendHourEnd(parseInt(e.target.value) || 21)}
                  min={0}
                  max={23}
                  className="w-20"
                />
                <span>h</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Jours min depuis dernière campagne : {minDaysSinceLastCampaign}</Label>
              <Slider
                value={[minDaysSinceLastCampaign]}
                onValueChange={([value]) => setMinDaysSinceLastCampaign(value)}
                min={1}
                max={30}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Ne pas recontacter quelqu&apos;un contacté par campagne il y a moins de {minDaysSinceLastCampaign} jours
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Programmation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5" />
              Programmation
            </CardTitle>
            <CardDescription>
              Optionnel : planifiez le lancement de la campagne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="scheduled">Date et heure de lancement</Label>
              <Input
                id="scheduled"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Laisser vide pour un lancement manuel.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreview}
            disabled={previewing || saving}
          >
            {previewing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            {previewCount !== null
              ? `${previewCount} contacts éligibles`
              : 'Prévisualiser et créer'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || previewing || !name.trim() || (useAgent && !agentId) || (!useAgent && !messageTemplate.trim())}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="mr-2 h-4 w-4" />
            )}
            Créer en brouillon
          </Button>
        </div>
      </div>
    </div>
  )
}
