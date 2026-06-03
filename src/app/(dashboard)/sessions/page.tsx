'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WhatsAppSession, Team } from '@/types/database'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { getCache, setCache } from '@/hooks/use-cached-fetch'
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
  UserCircle,
  Mail,
  Server,
} from 'lucide-react'
import type { EmailSession } from '@/types/database'
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
type SessionWithTeamIds = WhatsAppSession & {
  team_ids?: string[]
  owner_info?: { full_name: string | null; email: string | null } | null
}

export default function SessionsPage() {
  const { t, locale } = useTranslation()

  const STATUS_CONFIG = useMemo(() => ({
    connected: { label: t('sessions.connected'), variant: 'default' as const, icon: Wifi },
    disconnected: { label: t('sessions.disconnected'), variant: 'secondary' as const, icon: WifiOff },
    qr_pending: { label: t('sessions.qr_pending'), variant: 'outline' as const, icon: QrCode },
    error: { label: t('sessions.error'), variant: 'destructive' as const, icon: AlertCircle },
  }), [t])
  const [sessions, setSessions] = useState<SessionWithTeamIds[]>(() => getCache<SessionWithTeamIds[]>('sessions') || [])
  const [loading, setLoading] = useState(() => !getCache('sessions'))
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
  const [channelTab, setChannelTab] = useState<'whatsapp' | 'email'>('whatsapp')

  // Email sessions state
  const [emailSessions, setEmailSessions] = useState<(EmailSession & { channel: 'email' })[]>([])
  const [emailCreateOpen, setEmailCreateOpen] = useState(false)
  const [emailCreating, setEmailCreating] = useState(false)
  const [emailDeleting, setEmailDeleting] = useState<string | null>(null)
  const [emailProviderChoice, setEmailProviderChoice] = useState<'gmail' | 'smtp' | null>(null)
  const [editingEmailSession, setEditingEmailSession] = useState<EmailSession | null>(null)
  const [emailEditForm, setEmailEditForm] = useState({ name: '', display_name: '', smtp_host: '', smtp_port: '', smtp_user: '', smtp_password: '', imap_host: '', imap_port: '', email_agent_id: '', signature: '' })
  const [savingEmailEdit, setSavingEmailEdit] = useState(false)
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([])
  const [emailForm, setEmailForm] = useState({
    name: '',
    email_address: '',
    provider: 'smtp' as 'smtp' | 'gmail' | 'outlook',
    display_name: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    imap_host: '',
    imap_port: '993',
  })

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
        setCache('sessions', json.data)
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

  const fetchEmailSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/email-sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setEmailSessions(json.data)
      }
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    fetchTeams()
    fetchEmailSessions()
  }, [fetchSessions, fetchTeams, fetchEmailSessions])

  // Détecter le retour OAuth Gmail (?oauth_success=gmail&tab=email)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthSuccess = params.get('oauth_success')
    const oauthError = params.get('oauth_error')
    if (oauthSuccess === 'gmail') {
      setChannelTab('email')
      setEmailCreateOpen(false)
      fetchEmailSessions()
      toast.success('Boîte Gmail connectée avec succès !')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthError) {
      toast.error(`Erreur connexion Gmail : ${oauthError}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchEmailSessions])

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
        const json = await res.json()
        const qrCode = json.data?.qr_code || null
        const newStatus = json.data?.status || 'qr_pending'

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: newStatus as 'qr_pending' | 'disconnected', qr_code: qrCode, pairing_code: null } : s
          )
        )
        toast.success(t('sessions.session_disconnected'))

        // Auto-open QR dialog so user can rescan immediately
        if (newStatus === 'qr_pending') {
          const session = sessions.find(s => s.id === sessionId)
          if (session) {
            setQrSession({ ...session, status: 'qr_pending', qr_code: qrCode, pairing_code: null })
            // If no QR yet, fetch it
            if (!qrCode) {
              setQrLoading(true)
              try {
                const qrRes = await fetch(`/api/sessions/${sessionId}/qr`)
                if (qrRes.ok) {
                  const qrJson = await qrRes.json()
                  const fetchedQr = qrJson.data?.qr_code || null
                  setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, qr_code: fetchedQr } : s))
                  setQrSession(prev => prev ? { ...prev, qr_code: fetchedQr } : prev)
                }
              } finally {
                setQrLoading(false)
              }
            }
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
    const pendingSessions = sessions.filter((s) => s.status === 'qr_pending' && s.integration_type !== 'waba')
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

  async function handleConnectGmail() {
    if (!emailForm.name.trim()) {
      toast.error('Donnez un nom à la session avant de continuer')
      return
    }
    setEmailCreating(true)
    try {
      const res = await fetch('/api/oauth/gmail-session/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_name: emailForm.name,
          display_name: emailForm.display_name || undefined,
        }),
      })
      const json = await res.json()
      if (res.ok && json.url) {
        // Redirige vers Google — l'utilisateur choisit son compte Gmail
        window.location.href = json.url
      } else {
        toast.error(json.error || 'Erreur lors du lancement OAuth')
        setEmailCreating(false)
      }
    } catch {
      toast.error('Erreur réseau')
      setEmailCreating(false)
    }
  }

  async function handleCreateSmtpSession() {
    if (!emailForm.name.trim()) { toast.error('Donnez un nom à la session'); return }
    if (!emailForm.email_address.trim()) { toast.error('Adresse email requise'); return }
    if (!emailForm.smtp_host.trim() || !emailForm.smtp_user.trim() || !emailForm.smtp_password.trim()) {
      toast.error('Renseignez les informations SMTP')
      return
    }
    setEmailCreating(true)
    try {
      const res = await fetch('/api/email-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emailForm.name,
          email_address: emailForm.email_address,
          provider: 'smtp',
          display_name: emailForm.display_name || undefined,
          smtp_host: emailForm.smtp_host,
          smtp_port: parseInt(emailForm.smtp_port) || 587,
          smtp_user: emailForm.smtp_user,
          smtp_password: emailForm.smtp_password,
          imap_host: emailForm.imap_host || undefined,
          imap_port: emailForm.imap_port ? parseInt(emailForm.imap_port) : undefined,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setEmailSessions((prev) => [{ ...json.data, channel: 'email' as const }, ...prev])
        setEmailCreateOpen(false)
        setEmailProviderChoice(null)
        setEmailForm({ name: '', email_address: '', provider: 'smtp', display_name: '', smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '', imap_host: '', imap_port: '993' })
        toast.success('Session SMTP créée')
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setEmailCreating(false)
    }
  }

  function openEditEmailSession(session: EmailSession) {
    setEditingEmailSession(session)
    setEmailEditForm({
      name: session.name,
      display_name: session.display_name ?? '',
      smtp_host: session.smtp_host ?? '',
      smtp_port: session.smtp_port ? String(session.smtp_port) : '',
      smtp_user: session.smtp_user ?? '',
      smtp_password: '',
      imap_host: session.imap_host ?? '',
      imap_port: session.imap_port ? String(session.imap_port) : '',
      email_agent_id: session.email_agent_id ?? '',
      signature: (session as typeof session & { signature?: string | null }).signature ?? '',
    })
    // Charger tous les agents
    fetch('/api/agents')
      .then(r => r.json())
      .then(json => {
        if (json.data) setAllAgents((json.data as { id: string; name: string }[]).map(a => ({ id: a.id, name: a.name })))
      })
      .catch(() => {})
  }

  async function handleSaveEmailEdit() {
    if (!editingEmailSession) return
    setSavingEmailEdit(true)
    try {
      const body: Record<string, unknown> = {
        name: emailEditForm.name.trim(),
        display_name: emailEditForm.display_name.trim() || null,
        email_agent_id: emailEditForm.email_agent_id || null,
        signature: emailEditForm.signature.trim() || null,
      }
      if (editingEmailSession.provider === 'smtp') {
        if (emailEditForm.smtp_host) body.smtp_host = emailEditForm.smtp_host.trim()
        if (emailEditForm.smtp_port) body.smtp_port = parseInt(emailEditForm.smtp_port)
        if (emailEditForm.smtp_user) body.smtp_user = emailEditForm.smtp_user.trim()
        if (emailEditForm.smtp_password) body.smtp_password = emailEditForm.smtp_password
        if (emailEditForm.imap_host) body.imap_host = emailEditForm.imap_host.trim()
        if (emailEditForm.imap_port) body.imap_port = parseInt(emailEditForm.imap_port)
      }
      const res = await fetch(`/api/email-sessions/${editingEmailSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setEmailSessions((prev) => prev.map((s) => s.id === editingEmailSession.id ? { ...json.data, channel: 'email' as const } : s))
        setEditingEmailSession(null)
        toast.success('Session email mise à jour')
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSavingEmailEdit(false)
    }
  }

  async function handleDeleteEmailSession(id: string) {
    setEmailDeleting(id)
    try {
      const res = await fetch(`/api/email-sessions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEmailSessions((prev) => prev.filter((s) => s.id !== id))
        toast.success('Session email supprimée')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setEmailDeleting(null)
    }
  }

  if (loading) {
    return <BlobLoaderScreen />
  }

  return (
    <div className="p-4 sm:p-6">
      <div data-page-header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="sessions-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('sessions.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('sessions.description')}
          </p>
        </div>
        <div className="flex gap-2">
          {channelTab === 'whatsapp' ? (
            <Button data-tour="new-session-btn" onClick={openCreateDialog} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              {t('sessions.new_session')}
            </Button>
          ) : (
            <Button onClick={() => setEmailCreateOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Connecter une boîte email
            </Button>
          )}
        </div>
      </div>

      {/* Channel tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setChannelTab('whatsapp')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${channelTab === 'whatsapp' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          <Smartphone className="h-4 w-4" />
          WhatsApp
          <span className="rounded-full bg-background/20 px-1.5 text-xs">{sessions.length}</span>
        </button>
        <button
          onClick={() => setChannelTab('email')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${channelTab === 'email' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          <Mail className="h-4 w-4" />
          Email
          <span className="rounded-full bg-background/20 px-1.5 text-xs">{emailSessions.length}</span>
        </button>
      </div>

      {/* WhatsApp sessions */}
      {channelTab === 'whatsapp' && (sessions.length === 0 ? (
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
            const isShared = !!session.owner_info

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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {session.integration_type === 'waba' && (
                      <Badge variant="outline" className="w-fit text-xs gap-1">
                        <Cloud className="h-3 w-3" />
                        API
                      </Badge>
                    )}
                    {isShared && (
                      <Badge variant="outline" className="w-fit text-xs gap-1 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                        <UserCircle className="h-3 w-3" />
                        {session.owner_info?.full_name || session.owner_info?.email || 'Équipe'}
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
                        onClick={async () => {
                          // Check real status first — Evolution may still be open
                          try {
                            const statusRes = await fetch(`/api/sessions/${session.id}/status`)
                            const statusJson = await statusRes.json()
                            if (statusRes.ok && statusJson.data) {
                              const updated = statusJson.data as WhatsAppSession
                              setSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s))
                              if (updated.status === 'connected') {
                                toast.success(t('sessions.connected_toast', { name: getSessionDisplayName(updated) }))
                                return
                              }
                              // Still disconnected — show QR dialog
                              setQrSession(updated)
                              handleRefreshQR(session.id)
                              return
                            }
                          } catch { /* ignore */ }
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
                        {!isShared && (
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
                        )}
                      </>
                    )}

                    {!isShared && (
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
                    )}
                    {!isShared && (
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
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      {/* Email sessions */}
      {channelTab === 'email' && (emailSessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucune boîte email connectée</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connectez une boîte Gmail, Outlook ou SMTP pour gérer vos emails depuis l'inbox.
            </p>
            <Button className="mt-4" onClick={() => setEmailCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Connecter une boîte email
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {emailSessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-medium break-all">
                  {session.name}
                  {session.display_name && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({session.display_name})
                    </span>
                  )}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="w-fit text-xs gap-1 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                    <Mail className="h-3 w-3" />
                    Email
                  </Badge>
                  <Badge
                    variant={session.status === 'connected' ? 'default' : session.status === 'error' ? 'destructive' : 'secondary'}
                    className="w-fit"
                  >
                    {session.status === 'connected' ? (
                      <><Wifi className="mr-1 h-3 w-3" />Connecté</>
                    ) : session.status === 'error' ? (
                      <><AlertCircle className="mr-1 h-3 w-3" />Erreur</>
                    ) : (
                      <><WifiOff className="mr-1 h-3 w-3" />Déconnecté</>
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {session.email_address}
                  </span>
                  {session.smtp_host && (
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {session.smtp_host}:{session.smtp_port}
                    </span>
                  )}
                  <span className="mt-1">
                    {session.provider.toUpperCase()} · Créé le {new Date(session.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditEmailSession(session)}
                  >
                    <Settings2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteEmailSession(session.id)}
                    disabled={emailDeleting === session.id}
                  >
                    {emailDeleting === session.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {/* Dialog modification session email */}
      <Dialog open={!!editingEmailSession} onOpenChange={(open) => { if (!open) setEditingEmailSession(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier la session email</DialogTitle>
            <DialogDescription>Modifiez le nom ou les paramètres de connexion.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nom de la session</Label>
              <Input value={emailEditForm.name} onChange={(e) => setEmailEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Nom affiché (optionnel)</Label>
              <Input placeholder="Ex: Support Autyvia" value={emailEditForm.display_name} onChange={(e) => setEmailEditForm((f) => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Agent IA (optionnel)</Label>
              <Select
                value={emailEditForm.email_agent_id || 'none'}
                onValueChange={(v) => setEmailEditForm((f) => ({ ...f, email_agent_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun agent</SelectItem>
                  {allAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Génère des brouillons de réponse dans l'inbox.</p>
            </div>
            <div className="space-y-1">
              <Label>Signature email (optionnelle)</Label>
              <textarea
                rows={3}
                placeholder={"Cordialement,\nJean Dupont\nSupport Autyvia"}
                value={emailEditForm.signature}
                onChange={(e) => setEmailEditForm((f) => ({ ...f, signature: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Ajoutée automatiquement après chaque email envoyé.</p>
            </div>
            {editingEmailSession?.provider === 'smtp' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Serveur SMTP</Label>
                    <Input placeholder="smtp.example.com" value={emailEditForm.smtp_host} onChange={(e) => setEmailEditForm((f) => ({ ...f, smtp_host: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Port SMTP</Label>
                    <Input placeholder="587" value={emailEditForm.smtp_port} onChange={(e) => setEmailEditForm((f) => ({ ...f, smtp_port: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Utilisateur SMTP</Label>
                  <Input value={emailEditForm.smtp_user} onChange={(e) => setEmailEditForm((f) => ({ ...f, smtp_user: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Nouveau mot de passe (laisser vide pour conserver)</Label>
                  <Input type="password" placeholder="••••••••" value={emailEditForm.smtp_password} onChange={(e) => setEmailEditForm((f) => ({ ...f, smtp_password: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Serveur IMAP</Label>
                    <Input placeholder="imap.example.com" value={emailEditForm.imap_host} onChange={(e) => setEmailEditForm((f) => ({ ...f, imap_host: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Port IMAP</Label>
                    <Input placeholder="993" value={emailEditForm.imap_port} onChange={(e) => setEmailEditForm((f) => ({ ...f, imap_port: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingEmailSession(null)}>Annuler</Button>
            <Button onClick={handleSaveEmailEdit} disabled={savingEmailEdit || !emailEditForm.name.trim()}>
              {savingEmailEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Email Create Dialog */}
      <Dialog open={emailCreateOpen} onOpenChange={(open) => {
        setEmailCreateOpen(open)
        if (!open) {
          setEmailProviderChoice(null)
          setEmailForm({ name: '', email_address: '', provider: 'smtp', display_name: '', smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '', imap_host: '', imap_port: '993' })
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              Connecter une boîte email
            </DialogTitle>
            <DialogDescription>
              Choisissez le type de boîte email à connecter.
            </DialogDescription>
          </DialogHeader>

          {/* Étape 1 : choix du provider */}
          {!emailProviderChoice && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                onClick={() => setEmailProviderChoice('gmail')}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-5 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30 group-hover:bg-red-100 dark:group-hover:bg-red-900/40 transition-colors">
                  {/* Google G icon */}
                  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Gmail</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Via OAuth Google</p>
                </div>
              </button>
              <button
                onClick={() => setEmailProviderChoice('smtp')}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-5 hover:border-gray-400 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted group-hover:bg-muted/80 transition-colors">
                  <Server className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">SMTP / IMAP</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Outlook, OVH, custom…</p>
                </div>
              </button>
            </div>
          )}

          {/* Étape 2a : Gmail OAuth */}
          {emailProviderChoice === 'gmail' && (
            <div className="space-y-4 py-2">
              <button onClick={() => setEmailProviderChoice(null)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                ← Retour
              </button>
              <div className="space-y-2">
                <Label htmlFor="email-name">Nom de la session</Label>
                <Input
                  id="email-name"
                  placeholder="Support client, SAV, Commercial…"
                  value={emailForm.name}
                  onChange={(e) => setEmailForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Nom affiché dans l'inbox pour identifier cette boîte.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-display-name">Nom d'expéditeur (optionnel)</Label>
                <Input
                  id="email-display-name"
                  placeholder="Mon Entreprise Support"
                  value={emailForm.display_name}
                  onChange={(e) => setEmailForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-medium">Google vous demandera de :</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
                  <li>Choisir un compte Google (libre de choisir n'importe lequel)</li>
                  <li>Autoriser la lecture et l'envoi d'emails</li>
                </ul>
              </div>
              <Button
                onClick={handleConnectGmail}
                disabled={emailCreating || !emailForm.name.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {emailCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Connecter avec Google
              </Button>
            </div>
          )}

          {/* Étape 2b : SMTP */}
          {emailProviderChoice === 'smtp' && (
            <div className="space-y-3 py-2">
              <button onClick={() => setEmailProviderChoice(null)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                ← Retour
              </button>
              <div className="space-y-2">
                <Label htmlFor="smtp-name">Nom de la session</Label>
                <Input
                  id="smtp-name"
                  placeholder="Support client, SAV…"
                  value={emailForm.name}
                  onChange={(e) => setEmailForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-email">Adresse email</Label>
                <Input
                  id="smtp-email"
                  type="email"
                  placeholder="support@monentreprise.com"
                  value={emailForm.email_address}
                  onChange={(e) => setEmailForm((f) => ({ ...f, email_address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-display">Nom d'expéditeur (optionnel)</Label>
                <Input
                  id="smtp-display"
                  placeholder="Mon Entreprise Support"
                  value={emailForm.display_name}
                  onChange={(e) => setEmailForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="smtp-host">Serveur SMTP</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtp.example.com"
                    value={emailForm.smtp_host}
                    onChange={(e) => setEmailForm((f) => ({ ...f, smtp_host: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    placeholder="587"
                    value={emailForm.smtp_port}
                    onChange={(e) => setEmailForm((f) => ({ ...f, smtp_port: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-user">Identifiant SMTP</Label>
                <Input
                  id="smtp-user"
                  placeholder="support@monentreprise.com"
                  value={emailForm.smtp_user}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_user: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Mot de passe SMTP</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  placeholder="••••••••"
                  value={emailForm.smtp_password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_password: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="imap-host">Serveur IMAP (optionnel)</Label>
                  <Input
                    id="imap-host"
                    placeholder="imap.example.com"
                    value={emailForm.imap_host}
                    onChange={(e) => setEmailForm((f) => ({ ...f, imap_host: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-port">Port</Label>
                  <Input
                    id="imap-port"
                    type="number"
                    placeholder="993"
                    value={emailForm.imap_port}
                    onChange={(e) => setEmailForm((f) => ({ ...f, imap_port: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                onClick={handleCreateSmtpSession}
                disabled={emailCreating || !emailForm.name.trim() || !emailForm.email_address.trim() || !emailForm.smtp_host.trim() || !emailForm.smtp_user.trim() || !emailForm.smtp_password.trim()}
                className="w-full"
              >
                {emailCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Server className="mr-2 h-4 w-4" />
                )}
                Créer la session SMTP
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
