'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StatsResponse } from '@/types/stats'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/stats/kpi-card'
import { MessagesChart, TimeSeriesChart, AgentsComparisonChart } from '@/components/stats/charts'
import { toast } from 'sonner'
import {
  MessageSquare,
  ArrowDownLeft,
  Users,
  UserPlus,
  Loader2,
  Bot,
  Link2,
  MousePointerClick,
  ArrowRightLeft,
  Phone,
  Zap,
  Clock,
  Megaphone,
  Send,
  CheckCircle,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getSessionDisplayName, formatPhoneNumber } from '@/lib/format-phone'

type SessionOption = { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function StatsPage() {
  const [period, setPeriod] = useState('30')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Charger la liste des sessions une seule fois
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions')
        const json = await res.json()
        if (res.ok && json.data) {
          setSessions(
            json.data.map((s: { id: string; instance_name: string; phone_number?: string | null; display_name?: string | null }) => ({
              id: s.id,
              instance_name: s.instance_name,
              phone_number: s.phone_number,
              display_name: s.display_name,
            }))
          )
        }
      } catch {
        // silently fail
      }
    }
    loadSessions()
  }, [])

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (sessionFilter !== 'all') params.set('session_id', sessionFilter)
      const res = await fetch(`/api/stats?${params}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setStats(json.data)
      } else {
        toast.error(json.error || 'Erreur lors du chargement des statistiques')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [period, sessionFilter])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Statistiques</h1>
          <p className="text-sm text-muted-foreground">
            Analysez vos performances WhatsApp.
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sessionFilter} onValueChange={setSessionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Toutes les sessions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sessions</SelectItem>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {getSessionDisplayName({ display_name: s.display_name || null, phone_number: s.phone_number || null, instance_name: s.instance_name })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Vue globale</TabsTrigger>
            <TabsTrigger value="campaigns">Campagnes</TabsTrigger>
            <TabsTrigger value="agents">Agents IA</TabsTrigger>
            <TabsTrigger value="links">Liens WA</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
          </TabsList>

          {/* === Vue globale === */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard
                title="Messages total"
                value={stats.overview.totalMessages}
                trend={stats.overview.messagesTrend}
                icon={MessageSquare}
              />
              <KPICard
                title="Conversations actives"
                value={stats.overview.activeConversations}
                trend={stats.overview.conversationsTrend}
                icon={Users}
              />
              <KPICard
                title="Nouveaux contacts"
                value={stats.overview.newContacts}
                trend={stats.overview.contactsTrend}
                icon={UserPlus}
              />
              <KPICard
                title="Messages reçus"
                value={stats.overview.messagesIn}
                trend={null}
                icon={ArrowDownLeft}
              />
              <KPICard
                title="Taux de réponse IA"
                value={stats.overview.responseRate ?? 0}
                trend={null}
                icon={Zap}
                formatValue={(v) => `${v}%`}
              />
              <KPICard
                title="Temps réponse moyen"
                value={stats.overview.avgResponseTime ?? 0}
                trend={null}
                icon={Clock}
                formatValue={(v) => v > 0 ? formatSeconds(v) : '—'}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Messages par jour</CardTitle>
                </CardHeader>
                <CardContent>
                  <MessagesChart data={stats.charts.messagesOverTime} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nouvelles conversations</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={stats.charts.conversationsOverTime}
                    title=""
                    color="#40E9BE"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* === Campagnes === */}
          <TabsContent value="campaigns" className="space-y-6">
            {!stats.campaigns || stats.campaigns.totalCampaigns === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">Aucune campagne créée.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs Campagnes */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard
                    title="Total campagnes"
                    value={stats.campaigns.totalCampaigns}
                    trend={null}
                    icon={Megaphone}
                  />
                  <KPICard
                    title="Messages envoyés"
                    value={stats.campaigns.totalSent}
                    trend={null}
                    icon={Send}
                  />
                  <KPICard
                    title="Réponses reçues"
                    value={stats.campaigns.totalReplied}
                    trend={null}
                    icon={MessageSquare}
                  />
                  <KPICard
                    title="Taux de réponse"
                    value={stats.campaigns.overallResponseRate}
                    trend={null}
                    icon={TrendingUp}
                    formatValue={(v) => `${v}%`}
                  />
                </div>

                {/* Stats par campagne */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.campaigns.campaigns.map((campaign) => {
                    const statusColors: Record<string, string> = {
                      draft: 'bg-gray-100 text-gray-700',
                      scheduled: 'bg-blue-100 text-blue-700',
                      running: 'bg-green-100 text-green-700',
                      paused: 'bg-yellow-100 text-yellow-700',
                      completed: 'bg-purple-100 text-purple-700',
                      cancelled: 'bg-red-100 text-red-700',
                    }
                    const statusLabels: Record<string, string> = {
                      draft: 'Brouillon',
                      scheduled: 'Programmée',
                      running: 'En cours',
                      paused: 'En pause',
                      completed: 'Terminée',
                      cancelled: 'Annulée',
                    }
                    return (
                      <Card key={campaign.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Megaphone className="h-4 w-4" />
                              {campaign.name}
                            </CardTitle>
                            <Badge className={statusColors[campaign.status] || 'bg-gray-100'}>
                              {statusLabels[campaign.status] || campaign.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.sentCount.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Envoyés
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.repliedCount.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Réponses
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-primary">
                                {campaign.responseRate}%
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Taux de réponse
                              </p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold">
                                {campaign.totalRecipients.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Destinataires
                              </p>
                            </div>
                          </div>
                          {campaign.relanceAgentName && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Bot className="h-3 w-3" />
                                Agent : {campaign.relanceAgentName}
                              </div>
                            </div>
                          )}
                          {campaign.failedCount > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="h-3 w-3" />
                              {campaign.failedCount} échec(s)
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Stats par agent de relance */}
                {stats.campaigns.relanceAgentStats.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Performance des agents de relance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 pr-4">Agent</th>
                              <th className="pb-2 pr-4 text-right">Campagnes</th>
                              <th className="pb-2 pr-4 text-right">Envoyés</th>
                              <th className="pb-2 pr-4 text-right">Réponses</th>
                              <th className="pb-2 text-right">Taux</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.campaigns.relanceAgentStats.map((agent) => (
                              <tr key={agent.id} className="border-b last:border-0">
                                <td className="py-2 pr-4 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                    {agent.name}
                                  </div>
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.campaignsCount}
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.totalSent.toLocaleString('fr-FR')}
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  {agent.totalReplied.toLocaleString('fr-FR')}
                                </td>
                                <td className="py-2 text-right font-medium text-primary">
                                  {agent.responseRate}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* === Agents IA === */}
          <TabsContent value="agents" className="space-y-6">
            {stats.agents.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">Aucun agent IA configuré.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.agents.map((agent) => (
                    <Card key={agent.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Bot className="h-4 w-4" />
                            {agent.name}
                          </CardTitle>
                          <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                            {agent.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.messagesHandled.toLocaleString('fr-FR')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Messages traités
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.conversationsManaged.toLocaleString('fr-FR')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Conversations
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.responseRate != null ? `${agent.responseRate}%` : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Taux de réponse
                            </p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">
                              {agent.avgResponseTime != null ? formatSeconds(agent.avgResponseTime) : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Temps moyen
                            </p>
                          </div>
                          {agent.hasBookingUrl && (
                            <div className="col-span-2 border-t pt-3 mt-2">
                              <p className="text-2xl font-bold text-primary">
                                {agent.bookingClicks.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Clics lien RDV
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Comparaison des agents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AgentsComparisonChart data={stats.agents} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* === Liens WA === */}
          <TabsContent value="links" className="space-y-6">
            {stats.links.length === 0 ? (
              <Card>
                <CardContent className="flex h-40 items-center justify-center">
                  <p className="text-muted-foreground">Aucun lien WA créé.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard
                    title="Total clics"
                    value={stats.links.reduce((sum, l) => sum + l.totalClicks, 0)}
                    trend={null}
                    icon={MousePointerClick}
                  />
                  <KPICard
                    title="Total conversions"
                    value={stats.links.reduce((sum, l) => sum + l.conversionsCount, 0)}
                    trend={null}
                    icon={ArrowRightLeft}
                  />
                  <KPICard
                    title="Taux conversion moyen"
                    value={(() => {
                      const totalClicks = stats.links.reduce((s, l) => s + l.totalClicks, 0)
                      const totalConv = stats.links.reduce((s, l) => s + l.conversionsCount, 0)
                      return totalClicks > 0 ? Math.round((totalConv / totalClicks) * 100) : 0
                    })()}
                    trend={null}
                    icon={Link2}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.links.map((link) => {
                    const convRate = link.totalClicks > 0
                      ? Math.round((link.conversionsCount / link.totalClicks) * 100)
                      : 0
                    return (
                      <Card key={link.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Link2 className="h-4 w-4" />
                              {link.name}
                            </CardTitle>
                            <Badge variant={link.isActive ? 'default' : 'secondary'}>
                              {link.isActive ? 'Actif' : 'Inactif'}
                            </Badge>
                          </div>
                          {link.slug && (
                            <p className="text-xs text-muted-foreground">
                              /{link.slug}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xl font-bold">
                                {link.totalClicks.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">Clics</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold">
                                {link.conversionsCount.toLocaleString('fr-FR')}
                              </p>
                              <p className="text-xs text-muted-foreground">Conv.</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold">{convRate}%</p>
                              <p className="text-xs text-muted-foreground">Taux</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* === Contacts === */}
          <TabsContent value="contacts" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard
                title="Total contacts"
                value={stats.overview.totalContacts}
                trend={null}
                icon={Users}
              />
              <KPICard
                title="Nouveaux contacts"
                value={stats.overview.newContacts}
                trend={stats.overview.contactsTrend}
                icon={UserPlus}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nouveaux contacts par jour</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={stats.charts.newContactsOverTime}
                  title=""
                  color="#8B5CF6"
                />
              </CardContent>
            </Card>

            {/* Top 10 contacts */}
            {stats.contacts.topContacts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Top 10 contacts (par messages)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Contact</th>
                          <th className="pb-2 pr-4">Téléphone</th>
                          <th className="pb-2 pr-4 text-right">Messages</th>
                          <th className="pb-2 text-right">Dernier message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.contacts.topContacts.map((contact) => (
                          <tr key={contact.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">
                              {contact.name || 'Inconnu'}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {formatPhoneNumber(contact.phoneNumber)}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right font-medium">
                              {contact.messageCount.toLocaleString('fr-FR')}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {contact.lastMessageAt
                                ? formatDistanceToNow(
                                    new Date(contact.lastMessageAt),
                                    { addSuffix: true, locale: fr }
                                  )
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contacts par session */}
            {stats.contacts.contactsBySession.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Contacts par session
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.contacts.contactsBySession.map((s) => (
                      <div key={s.sessionId} className="flex items-center justify-between">
                        <span className="text-sm">{s.sessionName}</span>
                        <Badge variant="secondary">
                          {s.contactCount.toLocaleString('fr-FR')} contacts
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
