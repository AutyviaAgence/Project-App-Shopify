'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import type { AIAgent, WhatsAppSession, ConversationTag, Team, Campaign, WALink } from '@/types/database'
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
  MessageCircle,
  Filter,
  Shield,
  Clock,
  Users,
  Tag,
  Link2,
  Calendar,
  AlertTriangle,
  Save,
} from 'lucide-react'
import { getSessionDisplayName } from '@/lib/format-phone'

type AgentWithType = AIAgent & { agent_type?: 'conversation' | 'relance' }
type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [campaign, setCampaign] = useState<Campaign | null>(null)

  // Options
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AgentWithType[]>([])
  const [tags, setTags] = useState<ConversationTag[]>([])
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [links, setLinks] = useState<WALink[]>([])
  const [trackingSources, setTrackingSources] = useState<string[]>([])

  // Form state
  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState<string>('')
  const [useAgent, setUseAgent] = useState(true)
  const [agentId, setAgentId] = useState<string>('')
  const [conversationAgentId, setConversationAgentId] = useState<string>('')
  const [messageTemplate, setMessageTemplate] = useState('')

  // Filters
  const [filterSessionIds, setFilterSessionIds] = useState<string[]>([])
  const [filterTrackingSources, setFilterTrackingSources] = useState<string[]>([])
  const [filterLinkIds, setFilterLinkIds] = useState<string[]>([])
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
      // Charger la campagne et les options en parallèle
      const [campaignRes, sessionsRes, agentsRes, tagsRes, teamsRes, linksRes] = await Promise.all([
        fetch(`/api/campaigns/${id}`),
        fetch('/api/sessions'),
        fetch('/api/agents'),
        fetch('/api/tags'),
        fetch('/api/teams'),
        fetch('/api/links'),
      ])

      const [campaignJson, sessionsJson, agentsJson, tagsJson, teamsJson, linksJson] = await Promise.all([
        campaignRes.json(),
        sessionsRes.json(),
        agentsRes.json(),
        tagsRes.json(),
        teamsRes.json(),
        linksRes.json(),
      ])

      if (!campaignRes.ok || !campaignJson.data) {
        toast.error('Campagne non trouvée')
        router.push('/campaigns')
        return
      }

      const c = campaignJson.data as Campaign
      setCampaign(c)

      // Remplir le formulaire avec les données existantes
      setName(c.name)
      setTeamId(c.team_id || '')
      setUseAgent(!!c.relance_agent_id)
      setAgentId(c.relance_agent_id || '')
      setConversationAgentId(c.conversation_agent_id || '')
      setMessageTemplate(c.message_template || '')
      setFilterSessionIds(c.filter_session_ids || [])
      setFilterTrackingSources(c.filter_tracking_sources || [])
      setFilterLinkIds(c.filter_link_ids || [])
      setFilterTagIds(c.filter_tag_ids || [])
      setFilterInactivityDays(c.filter_inactivity_days || 7)
      setFilterExcludeReplied(c.filter_exclude_replied || false)
      setMaxRecipients(c.max_recipients || 50)
      setDelayBetweenMin(c.delay_between_min || 30)
      setDelayBetweenMax(c.delay_between_max || 120)
      setMessagesPerHour(c.messages_per_hour || 20)
      setSendHourStart(c.send_hour_start || 9)
      setSendHourEnd(c.send_hour_end || 21)
      setMinDaysSinceLastCampaign(c.min_days_since_last_campaign || 7)
      if (c.scheduled_at) {
        // Convertir en format datetime-local
        const date = new Date(c.scheduled_at)
        setScheduledAt(date.toISOString().slice(0, 16))
      }

      if (sessionsJson.data) setSessions(sessionsJson.data)
      if (agentsJson.data) setAgents(agentsJson.data)
      if (tagsJson.data) setTags(tagsJson.data)
      if (teamsJson.data) {
        setTeams(teamsJson.data.filter((t: TeamWithRole) => t.my_role === 'owner' || t.my_role === 'admin'))
      }
      if (linksJson.data) setLinks(linksJson.data)

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
  }, [id, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          team_id: teamId || null,
          relance_agent_id: useAgent && agentId ? agentId : null,
          conversation_agent_id: conversationAgentId || null,
          message_template: !useAgent ? messageTemplate : null,
          filter_session_ids: filterSessionIds.length > 0 ? filterSessionIds : null,
          filter_tracking_sources: filterTrackingSources.length > 0 ? filterTrackingSources : null,
          filter_link_ids: filterLinkIds.length > 0 ? filterLinkIds : null,
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
        toast.success('Campagne mise à jour')
        router.push(`/campaigns/${id}`)
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
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

  if (!campaign) {
    return null
  }

  // Ne pas permettre l'édition si la campagne n'est pas en brouillon
  const canEdit = campaign.status === 'draft' || campaign.status === 'scheduled'

  const relanceAgents = agents.filter(a => a.agent_type === 'relance')

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Modifier la campagne</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit
              ? 'Modifiez les paramètres de votre campagne.'
              : 'Cette campagne ne peut plus être modifiée (en cours ou terminée).'}
          </p>
        </div>
      </div>

      {!canEdit && (
        <Card className="mb-6 border-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              <p>Cette campagne est en statut &quot;{campaign.status}&quot; et ne peut pas être modifiée.</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                disabled={!canEdit}
              />
            </div>

            {teams.length > 0 && (
              <div className="space-y-2">
                <Label>Équipe (optionnel)</Label>
                <Select value={teamId || 'none'} onValueChange={(v) => setTeamId(v === 'none' ? '' : v)} disabled={!canEdit}>
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
              <Switch checked={useAgent} onCheckedChange={setUseAgent} disabled={!canEdit} />
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
                  <Select value={agentId} onValueChange={setAgentId} disabled={!canEdit}>
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
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">
                  Ce message sera envoyé identique à tous les contacts.
                </p>
              </div>
            )}

            {/* Agent de conversation (suivi) */}
            <div className="space-y-2 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Agent de conversation (suivi)
              </Label>
              <p className="text-xs text-muted-foreground">
                Cet agent prendra le relais pour répondre aux contacts après le message de relance.
              </p>
              <Select
                value={conversationAgentId || 'none'}
                onValueChange={(v) => setConversationAgentId(v === 'none' ? '' : v)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Garder l'agent actuel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Garder l&apos;agent actuel de chaque conversation</SelectItem>
                  {agents
                    .filter((a) => a.agent_type === 'conversation')
                    .map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
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
                    className={canEdit ? 'cursor-pointer' : 'cursor-default'}
                    onClick={() => {
                      if (!canEdit) return
                      setFilterSessionIds((prev) =>
                        prev.includes(session.id)
                          ? prev.filter((sid) => sid !== session.id)
                          : [...prev, session.id]
                      )
                    }}
                  >
                    {getSessionDisplayName(session)}
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
                      className={canEdit ? 'cursor-pointer' : 'cursor-default'}
                      onClick={() => {
                        if (!canEdit) return
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

            {/* Liens WhatsApp */}
            {links.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Liens WhatsApp
                </Label>
                <div className="flex flex-wrap gap-2">
                  {links.map((link) => (
                    <Badge
                      key={link.id}
                      variant={filterLinkIds.includes(link.id) ? 'default' : 'outline'}
                      className={canEdit ? 'cursor-pointer' : 'cursor-default'}
                      onClick={() => {
                        if (!canEdit) return
                        setFilterLinkIds((prev) =>
                          prev.includes(link.id)
                            ? prev.filter((lid) => lid !== link.id)
                            : [...prev, link.id]
                        )
                      }}
                    >
                      {link.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cibler les contacts venus via ces liens spécifiques
                </p>
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
                      className={canEdit ? 'cursor-pointer' : 'cursor-default'}
                      style={{ backgroundColor: filterTagIds.includes(tag.id) ? tag.color : undefined }}
                      onClick={() => {
                        if (!canEdit) return
                        setFilterTagIds((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((tid) => tid !== tag.id)
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
                disabled={!canEdit}
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
              <Switch checked={filterExcludeReplied} onCheckedChange={setFilterExcludeReplied} disabled={!canEdit} />
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    value={delayBetweenMax}
                    onChange={(e) => setDelayBetweenMax(parseInt(e.target.value) || 120)}
                    min={30}
                    max={600}
                    disabled={!canEdit}
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
                  disabled={!canEdit}
                />
                <span>h à</span>
                <Input
                  type="number"
                  value={sendHourEnd}
                  onChange={(e) => setSendHourEnd(parseInt(e.target.value) || 21)}
                  min={0}
                  max={23}
                  className="w-20"
                  disabled={!canEdit}
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
                disabled={!canEdit}
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
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                Laisser vide pour un lancement manuel.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || !name.trim() || (useAgent && !agentId) || (!useAgent && !messageTemplate.trim())}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
