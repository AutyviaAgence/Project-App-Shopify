'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StatsResponse } from '@/types/stats'
import type { WhatsAppSession } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/stats/kpi-card'
import { MessagesChart, TimeSeriesChart } from '@/components/stats/charts'
import { toast } from 'sonner'
import {
  MessageSquare,
  Users,
  UserPlus,
  Zap,
  Loader2,
  Smartphone,
  Bot,
  Link2,
} from 'lucide-react'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch('/api/stats?period=7'),
        fetch('/api/sessions'),
      ])
      const statsJson = await statsRes.json()
      const sessionsJson = await sessionsRes.json()

      if (statsRes.ok && statsJson.data) {
        setStats(statsJson.data)
      }
      if (sessionsRes.ok && sessionsJson.data) {
        setSessions(sessionsJson.data)
      }
    } catch {
      toast.error('Erreur lors du chargement du dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const connectedSessions = sessions.filter((s) => s.status === 'connected').length
  const activeAgents = stats?.agents.filter((a) => a.isActive).length ?? 0
  const totalAgents = stats?.agents.length ?? 0
  const activeLinks = stats?.links.filter((l) => l.isActive).length ?? 0
  const totalLinks = stats?.links.length ?? 0

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Aperçu de votre activité des 7 derniers jours.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Messages"
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
              title="Taux de réponse IA"
              value={stats.overview.responseRate ?? 0}
              trend={null}
              icon={Zap}
              formatValue={(v) => `${v}%`}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <MessagesChart data={stats.charts.messagesOverTime} />
            <TimeSeriesChart
              data={stats.charts.conversationsOverTime}
              title="Nouvelles conversations"
              color="hsl(var(--chart-3))"
            />
          </div>

          {/* Quick overview */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  Sessions WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold">
                    {connectedSessions}/{sessions.length}
                  </p>
                  <Badge variant={connectedSessions > 0 ? 'default' : 'secondary'}>
                    {connectedSessions > 0 ? 'Connectée(s)' : 'Aucune'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bot className="h-4 w-4" />
                  Agents IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold">
                    {activeAgents}/{totalAgents}
                  </p>
                  <Badge variant={activeAgents > 0 ? 'default' : 'secondary'}>
                    {activeAgents > 0 ? 'Actif(s)' : 'Aucun'}
                  </Badge>
                </div>
                {stats.overview.avgResponseTime != null && stats.overview.avgResponseTime > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Temps de réponse moyen : {formatSeconds(stats.overview.avgResponseTime)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Link2 className="h-4 w-4" />
                  Liens WA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold">
                    {activeLinks}/{totalLinks}
                  </p>
                  <Badge variant={activeLinks > 0 ? 'default' : 'secondary'}>
                    {activeLinks > 0 ? 'Actif(s)' : 'Aucun'}
                  </Badge>
                </div>
                {totalLinks > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {stats.links.reduce((s, l) => s + l.totalClicks, 0).toLocaleString('fr-FR')} clics total
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}
