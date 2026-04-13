'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WhatsAppSession, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Plus,
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Globe,
  Settings2,
  Save,
  Users,
  Download,
  Cloud,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { MultiTeamSelect } from '@/components/multi-team-select'
import { getSessionDisplayName, formatPhoneNumber } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }
type SessionWithTeamIds = WhatsAppSession & { team_ids?: string[] }

export default function SessionsPage() {
  const { t, locale } = useTranslation()

  const STATUS_CONFIG = useMemo(() => ({
    connected: { label: t('sessions.connected'), variant: 'default' as const, icon: Wifi },
    disconnected: { label: t('sessions.disconnected'), variant: 'secondary' as const, icon: WifiOff },
    qr_pending: { label: t('sessions.qr_pending'), variant: 'outline' as const, icon: QrCode },
    error: { label: t('sessions.error'), variant: 'destructive' as const, icon: AlertCircle },
  }), [t])
  const [sessions, setSessions] = useState<SessionWithTeamIds[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [qrSession, setQrSession] = useState<SessionWithTeamIds | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [webhookConfiguring, setWebhookConfiguring] = useState<string | null>(null)
  const [editingSession, setEditingSession] = useState<SessionWithTeamIds | null>(null)
  const [formDailyLimit, setFormDailyLimit] = useState('')
  const [formAiMessageDelay, setFormAiMessageDelay] = useState('')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formQualifierAgentId, setFormQualifierAgentId] = useState<string | null>(null)
  const [formSessionTeamIds, setFormSessionTeamIds] = useState<string[]>([])
  const [savingSettings, setSavingSettings] = useState(false)
  const [qualifierAgents, setQualifierAgents] = useState<{ id: string; name: string }[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<SessionWithTeamIds | null>(null)
  const [syncingContacts, setSyncingContacts] = useState<string | null>(null)
  const [connectionMethod, setConnectionMethod] = useState<'qr' | 'pairing'>('qr')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [sessionType, setSessionType] = useState<'evolution' | 'waba'>('evolution')
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState('')
  const [wabaBusinessAccountId, setWabaBusinessAccountId] = useState('')
  const [wabaAccessToken, setWabaAccessToken] = useState('')
  const [wabaWebhookInfo, setWabaWebhookInfo] = useState<{ url: string; token: string } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState<string | null>(null)

  async function handleReconnectWaba(sessionId: string) {
    setReconnecting(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/status`)
      const json = await res.json()
      if (res.ok && json.data) {
        const updated = json.data as WhatsAppSession
        setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        if (updated.status === 'connected') {
          toast.success(t('sessions.waba_reconnected'))
        } else {
          toast.error(t('sessions.invalid_token'))
        }
      } else {
        toast.error(json.error || t('sessions.verification_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setReconnecting(null)
    }
  }

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data)
      }
    } catch {
      toast.error(t('sessions.load_error'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        // Filtrer pour ne garder que les équipes où l'utilisateur est owner ou admin
        setTeams(json.data.filter((t: TeamWithRole) => t.my_role === 'owner' || t.my_role === 'admin'))
      }
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    fetchTeams()
  }, [fetchSessions, fetchTeams])

  // Realtime subscription for session status updates
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('sessions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as WhatsAppSession
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            )
            // Update QR dialog if open
            if (qrSession?.id === updated.id) {
              setQrSession(updated)
              if (updated.status === 'connected') {
                toast.success(t('sessions.whatsapp_connected'))
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string }
            setSessions((prev) => prev.filter((s) => s.id !== deleted.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qrSession?.id])

  function openCreateDialog() {
    setSelectedTeamIds([])
    setConnectionMethod('qr')
    setPhoneNumber('')
    setSessionType('evolution')
    setWabaPhoneNumberId('')
    setWabaBusinessAccountId('')
    setWabaAccessToken('')
    setWabaWebhookInfo(null)
    setCopiedField(null)
    setCreateDialogOpen(true)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        team_ids: selectedTeamIds,
      }

      if (sessionType === 'waba') {
        body.integration_type = 'waba'
        body.waba_phone_number_id = wabaPhoneNumberId.trim()
        body.waba_business_account_id = wabaBusinessAccountId.trim()
        body.waba_access_token = wabaAccessToken.trim()
      } else {
        if (connectionMethod === 'pairing') {
          body.connection_method = 'pairing'
          body.phone_number = phoneNumber.replace(/\D/g, '')
        }
      }

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t('sessions.create_error'))
        return
      }
      const newSession = json.data as SessionWithTeamIds
      setSessions((prev) => [newSession, ...prev])

      if (sessionType === 'waba') {
        toast.success(t('sessions.waba_created'))
        // Show webhook configuration instructions (keep dialog open)
        const appDomain = window.location.origin
        setWabaWebhookInfo({
          url: `${appDomain}/api/webhook/waba`,
          token: 'autyvia_waba_verify',
        })
        return
      }

      setCreateDialogOpen(false)
      // Open connection dialog immediately
      setQrSession(newSession)
      if (connectionMethod === 'pairing' && newSession.pairing_code) {
        toast.success(t('sessions.session_created_pairing'))
      } else {
        toast.success(t('sessions.session_created_qr'))
      }

      // Reset form
      setPhoneNumber('')
      setConnectionMethod('qr')
      setSessionType('evolution')
      setWabaPhoneNumberId('')
      setWabaBusinessAccountId('')
      setWabaAccessToken('')
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setCreating(false)
    }
  }

  async function handleRefreshQR(sessionId: string) {
    setQrLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/qr`)
      const json = await res.json()
      if (res.ok && json.data) {
        setQrSession((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            qr_code: json.data.qr_code || prev.qr_code,
            pairing_code: json.data.pairing_code || prev.pairing_code,
          }
        })
      } else {
        toast.error(t('sessions.qr_fetch_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setQrLoading(false)
    }
  }

  async function handleDisconnect(sessionId: string) {
    setDisconnecting(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/disconnect`, {
        method: 'POST',
      })
      if (res.ok) {
        // Backend restarts instance → qr_pending state, show QR to rescan immediately
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: 'qr_pending' as const, qr_code: null, pairing_code: null } : s
          )
        )
        toast.success(t('sessions.session_disconnected'))
        // Auto-open QR dialog so user can rescan
        const session = sessions.find(s => s.id === sessionId)
        if (session) {
          const qrSessionObj = { ...session, status: 'qr_pending' as const, qr_code: null, pairing_code: null }
          setQrSession(qrSessionObj)
          setQrLoading(true)
          try {
            const qrRes = await fetch(`/api/sessions/${sessionId}/qr`)
            if (qrRes.ok) {
              const qrJson = await qrRes.json()
              const qrCode = qrJson.data?.qr_code || null
              setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, qr_code: qrCode } : s))
              setQrSession(prev => prev ? { ...prev, qr_code: qrCode } : prev)
            }
          } finally {
            setQrLoading(false)
          }
        }
      } else {
        const json = await res.json()
        toast.error(json.error || t('sessions.disconnect_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDisconnecting(null)
    }
  }

  async function handleConfigureWebhook(sessionId: string) {
    setWebhookConfiguring(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/webhook`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(t('sessions.webhook_configured'))
      } else {
        toast.error(json.error || t('sessions.webhook_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setWebhookConfiguring(null)
    }
  }

  function openDeleteDialog(session: WhatsAppSession) {
    setSessionToDelete(session)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!sessionToDelete) return
    setDeleting(sessionToDelete.id)
    try {
      const res = await fetch(`/api/sessions/${sessionToDelete.id}/disconnect`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id))
        toast.success(t('sessions.session_deleted'))
        setDeleteDialogOpen(false)
        setSessionToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('sessions.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(null)
    }
  }

  async function handleSyncContacts(sessionId: string) {
    setSyncingContacts(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/sync-contacts`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok && json.data) {
        toast.success(t('sessions.contacts_synced', { count: json.data.synced }))
      } else {
        toast.error(json.error || t('sessions.sync_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSyncingContacts(null)
    }
  }

  async function handleSaveSessionSettings() {
    if (!editingSession) return
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/sessions/${editingSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: formDisplayName.trim() || null,
          daily_ai_message_limit: formDailyLimit.trim() ? parseInt(formDailyLimit) : null,
          ai_message_delay: formAiMessageDelay.trim() ? parseInt(formAiMessageDelay) : null,
          qualifier_agent_id: formQualifierAgentId || null,
          team_ids: formSessionTeamIds,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions((prev) => prev.map((s) => (s.id === editingSession.id ? json.data : s)))
        toast.success(t('sessions.settings_saved'))
        setEditingSession(null)
      } else {
        toast.error(json.error || t('sessions.settings_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSavingSettings(false)
    }
  }

  // Auto-configure webhook for connected sessions on load
  useEffect(() => {
    const connectedSessions = sessions.filter((s) => s.status === 'connected')
    if (connectedSessions.length === 0) return

    for (const s of connectedSessions) {
      fetch(`/api/sessions/${s.id}/webhook`, { method: 'POST' })
        .then((res) => res.json())
        .then((json) => {
          if (json.data) {
            console.log(`[Auto-webhook] Configured for ${s.instance_name}`)
          }
        })
        .catch(() => {
          // Silently ignore — webhook will be retried on next load
        })
    }
    // Only run once when sessions are first loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length > 0])

  // Poll status for non-connected Evolution sessions (fallback when webhook can't reach localhost)
  // WABA sessions don't need polling — reconnection is manual via button
  useEffect(() => {
    const pendingSessions = sessions.filter((s) => s.status !== 'connected' && s.integration_type !== 'waba')
    if (pendingSessions.length === 0) return

    const poll = async () => {
      for (const s of pendingSessions) {
        try {
          const res = await fetch(`/api/sessions/${s.id}/status`)
          const json = await res.json()
          if (res.ok && json.data) {
            const updated = json.data as WhatsAppSession
            if (updated.status !== s.status) {
              setSessions((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p))
              )
              if (qrSession?.id === updated.id) {
                setQrSession(updated)
              }
              if (updated.status === 'connected') {
                toast.success(t('sessions.connected_toast', { name: getSessionDisplayName(updated) }))
              }
            }
          }
        } catch {
          // Ignore polling errors
        }
      }
    }

    poll() // Run immediately on mount/change
    const interval = setInterval(poll, 5_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => `${s.id}:${s.status}`).join(',')])

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
        <div data-tour="sessions-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('sessions.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('sessions.description')}
          </p>
        </div>
        <Button data-tour="new-session-btn" onClick={openCreateDialog} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t('sessions.new_session')}
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Smartphone className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t('sessions.no_sessions')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('sessions.no_sessions_desc')}
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {t('sessions.create_session')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => {
            const config = STATUS_CONFIG[session.status]
            const StatusIcon = config.icon
            const isDisconnecting = disconnecting === session.id
            const isDeleting = deleting === session.id

            return (
              <Card key={session.id}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium break-all">
                    {getSessionDisplayName(session)}
                    {session.display_name && session.phone_number && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({formatPhoneNumber(session.phone_number)})
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {session.integration_type === 'waba' && (
                      <Badge variant="outline" className="w-fit text-xs gap-1">
                        <Cloud className="h-3 w-3" />
                        API
                      </Badge>
                    )}
                    <Badge variant={config.variant} className="w-fit">
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {session.status === 'qr_pending' && session.pairing_code
                        ? t('sessions.code_pending')
                        : config.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                    <span>
                      {t('sessions.created_on', {
                        date: new Date(session.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      })}
                    </span>
                    {(session.team_ids?.length || session.team_id) && (
                      <div className="flex flex-wrap gap-1">
                        {(session.team_ids || (session.team_id ? [session.team_id] : [])).map(tid => (
                          <Badge key={tid} variant="outline" className="gap-1 text-xs font-normal">
                            <Users className="h-3 w-3" />
                            {teams.find(tm => tm.id === tid)?.name || t('common.team')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {(session.daily_ai_message_limit != null || session.ai_message_delay != null) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {session.daily_ai_message_limit != null && (
                        <span>{t('sessions.ai_limit', { limit: session.daily_ai_message_limit.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US') })}</span>
                      )}
                      {session.daily_ai_message_limit != null && session.ai_message_delay != null && ' · '}
                      {session.ai_message_delay != null && (
                        <span>{t('sessions.delay_display', { seconds: session.ai_message_delay })}</span>
                      )}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {session.status === 'qr_pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQrSession(session)}
                      >
                        {session.pairing_code ? (
                          <>
                            <Smartphone className="mr-1 h-3 w-3" />
                            {t('sessions.pairing_code')}
                          </>
                        ) : (
                          <>
                            <QrCode className="mr-1 h-3 w-3" />
                            {t('sessions.qr_code')}
                          </>
                        )}
                      </Button>
                    )}

                    {session.status === 'disconnected' && session.integration_type !== 'waba' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQrSession(session)
                          handleRefreshQR(session.id)
                        }}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        {t('sessions.reconnect')}
                      </Button>
                    )}

                    {session.status === 'disconnected' && session.integration_type === 'waba' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReconnectWaba(session.id)}
                        disabled={reconnecting === session.id}
                      >
                        {reconnecting === session.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3 w-3" />
                        )}
                        {t('sessions.reconnect')}
                      </Button>
                    )}

                    {session.status === 'connected' && (
                      <>
                        {session.integration_type !== 'waba' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSyncContacts(session.id)}
                              disabled={syncingContacts === session.id}
                              title={t('sessions.contacts')}
                            >
                              {syncingContacts === session.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="mr-1 h-3 w-3" />
                              )}
                              {t('sessions.contacts')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfigureWebhook(session.id)}
                              disabled={webhookConfiguring === session.id}
                            >
                              {webhookConfiguring === session.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Globe className="mr-1 h-3 w-3" />
                              )}
                              {t('sessions.webhook')}
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDisconnect(session.id)}
                          disabled={isDisconnecting}
                        >
                          {isDisconnecting ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <WifiOff className="mr-1 h-3 w-3" />
                          )}
                          {t('sessions.disconnect')}
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingSession(session)
                        setFormDisplayName(session.display_name || '')
                        setFormDailyLimit(
                          session.daily_ai_message_limit != null
                            ? String(session.daily_ai_message_limit)
                            : ''
                        )
                        setFormAiMessageDelay(
                          session.ai_message_delay != null
                            ? String(session.ai_message_delay)
                            : ''
                        )
                        setFormSessionTeamIds(session.team_ids || (session.team_id ? [session.team_id] : []))
                        setFormQualifierAgentId((session as unknown as { qualifier_agent_id: string | null }).qualifier_agent_id || null)
                        // Load qualifier agents
                        fetch('/api/agents')
                          .then(r => r.json())
                          .then(json => {
                            if (json.data) {
                              setQualifierAgents(
                                (json.data as { id: string; name: string; agent_type: string }[])
                                  .filter((a) => a.agent_type === 'qualifier')
                                  .map((a) => ({ id: a.id, name: a.name }))
                              )
                            }
                          })
                          .catch(() => {})
                      }}
                    >
                      <Settings2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(session)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Connection Dialog (QR Code or Pairing Code) */}
      <Dialog
        open={!!qrSession}
        onOpenChange={(open) => {
          if (!open) setQrSession(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {qrSession?.pairing_code ? t('sessions.pairing_title') : t('sessions.scan_qr_title')}
            </DialogTitle>
            <DialogDescription>
              {qrSession?.pairing_code
                ? t('sessions.pairing_desc')
                : t('sessions.scan_qr_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {qrSession?.status === 'connected' ? (
              <div className="flex flex-col items-center gap-3">
                <Wifi className="h-16 w-16 text-green-500" />
                <p className="text-sm font-medium text-green-600">
                  {t('sessions.connected_label')}
                </p>
                {qrSession.phone_number && (
                  <p className="text-sm text-muted-foreground">
                    +{qrSession.phone_number}
                  </p>
                )}
              </div>
            ) : qrSession?.pairing_code ? (
              <>
                <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-8 py-6">
                  <p className="text-center font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                    {qrSession.pairing_code}
                  </p>
                </div>
                <div className="mt-4 space-y-3 text-center">
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm font-medium mb-2">{t('sessions.pairing_instructions_title')}</p>
                    <ol className="text-xs text-muted-foreground text-left space-y-1 list-decimal list-inside">
                      <li>{t('sessions.pairing_step1')}</li>
                      <li>{t('sessions.pairing_step2')}</li>
                      <li>{t('sessions.pairing_step3')}</li>
                      <li>{t('sessions.pairing_step4')}</li>
                      <li>{t('sessions.pairing_step5')}</li>
                    </ol>
                  </div>
                  <div className="flex items-center gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefreshQR(qrSession.id)}
                      disabled={qrLoading}
                    >
                      {qrLoading ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      {t('sessions.new_code')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('sessions.code_expires')}
                    </p>
                  </div>
                </div>
              </>
            ) : qrSession?.qr_code ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSession.qr_code}
                  alt="QR Code WhatsApp"
                  className="h-64 w-64 rounded-lg"
                />
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefreshQR(qrSession.id)}
                    disabled={qrLoading}
                  >
                    {qrLoading ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    {t('sessions.refresh')}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t('sessions.auto_refresh')}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('common.loading')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRefreshQR(qrSession!.id)}
                  disabled={qrLoading}
                >
                  {qrLoading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  {t('sessions.fetch_code')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Settings Dialog */}
      <Dialog
        open={!!editingSession}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sessions.settings_title')}</DialogTitle>
            <DialogDescription>
              {t('sessions.settings_desc', { name: editingSession ? getSessionDisplayName(editingSession) : '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">
                {t('sessions.session_name')}
              </Label>
              <Input
                id="display-name"
                placeholder={editingSession?.phone_number ? formatPhoneNumber(editingSession.phone_number) : editingSession?.instance_name}
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('sessions.session_name_desc')}
              </p>
            </div>
            <MultiTeamSelect
              teams={teams}
              selectedTeamIds={formSessionTeamIds}
              onTeamIdsChange={setFormSessionTeamIds}
              label={t('sessions.teams_label')}
              description={t('sessions.teams_desc')}
              emptyDescription={t('sessions.teams_empty')}
            />
            <div className="space-y-2">
              <Label htmlFor="daily-limit">
                {t('sessions.daily_limit')}
              </Label>
              <Input
                id="daily-limit"
                type="number"
                min={1}
                max={100000}
                step={1}
                placeholder={t('sessions.daily_limit_placeholder')}
                value={formDailyLimit}
                onChange={(e) => setFormDailyLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('sessions.daily_limit_desc')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-delay">
                {t('sessions.delay_label')}
              </Label>
              <Input
                id="ai-delay"
                type="number"
                min={1}
                max={60}
                step={1}
                placeholder={t('sessions.delay_placeholder')}
                value={formAiMessageDelay}
                onChange={(e) => setFormAiMessageDelay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('sessions.delay_desc')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('agents.qualifier_session_label')}</Label>
              <Select
                value={formQualifierAgentId || 'none'}
                onValueChange={(v) => setFormQualifierAgentId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {qualifierAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('agents.qualifier_session_help')}
              </p>
            </div>
            <Button
              onClick={handleSaveSessionSettings}
              disabled={savingSettings}
              className="w-full"
            >
              {savingSettings ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sessions.new_session_title')}</DialogTitle>
            <DialogDescription>
              {t('sessions.new_session_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Sélection du type de session */}
            <Tabs
              value={sessionType}
              onValueChange={(v) => setSessionType(v as 'evolution' | 'waba')}
            >
              <TabsList className="w-full">
                <TabsTrigger value="evolution" className="flex-1">
                  <QrCode className="mr-1 h-4 w-4" />
                  {t('sessions.whatsapp_qr')}
                </TabsTrigger>
                <TabsTrigger value="waba" className="flex-1">
                  <Cloud className="mr-1 h-4 w-4" />
                  {t('sessions.api_business')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="evolution">
                <div className="space-y-4">
                  <Tabs
                    value={connectionMethod}
                    onValueChange={(v) => setConnectionMethod(v as 'qr' | 'pairing')}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="qr" className="flex-1">{t('sessions.qr_code_tab')}</TabsTrigger>
                      <TabsTrigger value="pairing" className="flex-1">{t('sessions.pairing_code_tab')}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="qr">
                      <p className="text-sm text-muted-foreground">
                        {t('sessions.qr_desc')}
                      </p>
                    </TabsContent>

                    <TabsContent value="pairing">
                      <div className="space-y-2">
                        <Label htmlFor="phone-number">{t('sessions.phone_number')}</Label>
                        <Input
                          id="phone-number"
                          type="tel"
                          placeholder={t('sessions.phone_placeholder')}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('sessions.phone_desc')}
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </TabsContent>

              <TabsContent value="waba">
                {wabaWebhookInfo ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <p className="text-sm font-medium">{t('sessions.waba_success')}</p>
                    </div>
                    <div className="rounded-md border bg-muted/50 p-4 space-y-3">
                      <p className="text-sm font-medium">{t('sessions.waba_webhook_title')}</p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>{t('sessions.waba_step1')}</li>
                        <li>{t('sessions.waba_step2')}</li>
                        <li>{t('sessions.waba_step3')}</li>
                        <li>{t('sessions.waba_step4')}</li>
                      </ol>
                      <div className="space-y-2 pt-2">
                        <Label className="text-xs">{t('sessions.callback_url')}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={wabaWebhookInfo.url}
                            className="text-xs font-mono bg-background"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(wabaWebhookInfo.url, 'url')}
                          >
                            {copiedField === 'url' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t('sessions.verify_token')}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={wabaWebhookInfo.token}
                            className="text-xs font-mono bg-background"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(wabaWebhookInfo.token, 'token')}
                          >
                            {copiedField === 'token' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setCreateDialogOpen(false)
                        setWabaWebhookInfo(null)
                      }}
                      className="w-full"
                    >
                      {t('common.done')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t('sessions.waba_desc')}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="waba-phone-id">Phone Number ID</Label>
                      <Input
                        id="waba-phone-id"
                        placeholder="806014969271207"
                        value={wabaPhoneNumberId}
                        onChange={(e) => setWabaPhoneNumberId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="waba-business-id">Business Account ID</Label>
                      <Input
                        id="waba-business-id"
                        placeholder="838878661876293"
                        value={wabaBusinessAccountId}
                        onChange={(e) => setWabaBusinessAccountId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="waba-token">Access Token (Meta)</Label>
                      <Input
                        id="waba-token"
                        type="password"
                        placeholder="EAAh..."
                        value={wabaAccessToken}
                        onChange={(e) => setWabaAccessToken(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('sessions.waba_token_desc')}
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {!wabaWebhookInfo && (
              <>
                <MultiTeamSelect
                  teams={teams}
                  selectedTeamIds={selectedTeamIds}
                  onTeamIdsChange={setSelectedTeamIds}
                  label={t('sessions.teams_optional')}
                  description={t('sessions.teams_optional_desc')}
                  emptyDescription={t('sessions.teams_optional_empty')}
                />
                <Button
                  onClick={handleCreate}
                  disabled={
                    creating ||
                    (sessionType === 'evolution' && connectionMethod === 'pairing' && !phoneNumber.trim()) ||
                    (sessionType === 'waba' && (!wabaPhoneNumberId.trim() || !wabaBusinessAccountId.trim() || !wabaAccessToken.trim()))
                  }
                  className="w-full"
                >
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {t('sessions.create_session')}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setSessionToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('sessions.delete_title')}
        description={t('sessions.delete_desc', { name: sessionToDelete ? getSessionDisplayName(sessionToDelete) : '' })}
        loading={deleting === sessionToDelete?.id}
      />
    </div>
  )
}
