'use client'

import { useEffect, useState, useCallback } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

const STATUS_CONFIG = {
  connected: { label: 'Connecté', variant: 'default' as const, icon: Wifi },
  disconnected: { label: 'Déconnecté', variant: 'secondary' as const, icon: WifiOff },
  qr_pending: { label: 'QR en attente', variant: 'outline' as const, icon: QrCode },
  error: { label: 'Erreur', variant: 'destructive' as const, icon: AlertCircle },
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [qrSession, setQrSession] = useState<WhatsAppSession | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [webhookConfiguring, setWebhookConfiguring] = useState<string | null>(null)
  const [editingSession, setEditingSession] = useState<WhatsAppSession | null>(null)
  const [formDailyLimit, setFormDailyLimit] = useState('')
  const [formSessionTeamId, setFormSessionTeamId] = useState<string>('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<WhatsAppSession | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des sessions')
    } finally {
      setLoading(false)
    }
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
                toast.success('WhatsApp connecté !')
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
    setSelectedTeamId('')
    setCreateDialogOpen(true)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: selectedTeamId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Erreur lors de la création')
        return
      }
      const newSession = json.data as WhatsAppSession
      setSessions((prev) => [newSession, ...prev])
      setCreateDialogOpen(false)
      // Open QR dialog immediately
      setQrSession(newSession)
      toast.success('Session créée, scannez le QR code')
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setCreating(false)
    }
  }

  async function handleRefreshQR(sessionId: string) {
    setQrLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/qr`)
      const json = await res.json()
      if (res.ok && json.data?.qr_code) {
        setQrSession((prev) =>
          prev ? { ...prev, qr_code: json.data.qr_code } : prev
        )
      } else {
        toast.error('Impossible de récupérer le QR code')
      }
    } catch {
      toast.error('Erreur réseau')
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
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: 'disconnected' as const, qr_code: null } : s
          )
        )
        toast.success('Session déconnectée')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la déconnexion')
      }
    } catch {
      toast.error('Erreur réseau')
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
        toast.success('Webhook configuré !')
      } else {
        toast.error(json.error || 'Erreur lors de la configuration du webhook')
      }
    } catch {
      toast.error('Erreur réseau')
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
        toast.success('Session supprimée')
        setDeleteDialogOpen(false)
        setSessionToDelete(null)
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

  async function handleSaveSessionSettings() {
    if (!editingSession) return
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/sessions/${editingSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_ai_message_limit: formDailyLimit.trim() ? parseInt(formDailyLimit) : null,
          team_id: formSessionTeamId || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions((prev) => prev.map((s) => (s.id === editingSession.id ? json.data : s)))
        toast.success('Paramètres de session mis à jour')
        setEditingSession(null)
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
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

  // Poll status for all non-connected sessions (fallback when webhook can't reach localhost)
  useEffect(() => {
    const pendingSessions = sessions.filter((s) => s.status !== 'connected')
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
                toast.success(`WhatsApp connecté : ${updated.phone_number ? '+' + updated.phone_number : updated.instance_name}`)
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
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Sessions WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos connexions WhatsApp. Chaque session correspond à un numéro.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Smartphone className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucune session</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez votre première session WhatsApp pour commencer.
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Créer une session
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
                    {session.instance_name}
                    {session.phone_number && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (+{session.phone_number})
                      </span>
                    )}
                  </CardTitle>
                  <Badge variant={config.variant} className="w-fit">
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {config.label}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                    <span>
                      Créée le{' '}
                      {new Date(session.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    {session.team_id && (
                      <Badge variant="outline" className="gap-1 text-xs font-normal w-fit">
                        <Users className="h-3 w-3" />
                        {teams.find(t => t.id === session.team_id)?.name || 'Équipe'}
                      </Badge>
                    )}
                  </div>
                  {session.daily_ai_message_limit != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Limite IA : {session.daily_ai_message_limit.toLocaleString('fr-FR')} msg/jour
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {session.status === 'qr_pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQrSession(session)}
                      >
                        <QrCode className="mr-1 h-3 w-3" />
                        QR Code
                      </Button>
                    )}

                    {session.status === 'disconnected' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQrSession(session)
                          handleRefreshQR(session.id)
                        }}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Reconnecter
                      </Button>
                    )}

                    {session.status === 'connected' && (
                      <>
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
                          Webhook
                        </Button>
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
                          Déconnecter
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingSession(session)
                        setFormDailyLimit(
                          session.daily_ai_message_limit != null
                            ? String(session.daily_ai_message_limit)
                            : ''
                        )
                        setFormSessionTeamId(session.team_id || '')
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

      {/* QR Code Dialog */}
      <Dialog
        open={!!qrSession}
        onOpenChange={(open) => {
          if (!open) setQrSession(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanner le QR Code</DialogTitle>
            <DialogDescription>
              Ouvrez WhatsApp sur votre téléphone, allez dans Appareils liés, et
              scannez ce QR code.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {qrSession?.status === 'connected' ? (
              <div className="flex flex-col items-center gap-3">
                <Wifi className="h-16 w-16 text-green-500" />
                <p className="text-sm font-medium text-green-600">
                  WhatsApp connecté !
                </p>
                {qrSession.phone_number && (
                  <p className="text-sm text-muted-foreground">
                    +{qrSession.phone_number}
                  </p>
                )}
              </div>
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
                    Rafraîchir
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Rafraîchissement auto toutes les 20s
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Chargement du QR code...
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
                  Récupérer le QR
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
            <DialogTitle>Paramètres de la session</DialogTitle>
            <DialogDescription>
              Configurez les paramètres pour {editingSession?.instance_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="settings-team-select">Équipe</Label>
              <Select value={formSessionTeamId || 'personal'} onValueChange={(v) => setFormSessionTeamId(v === 'personal' ? '' : v)}>
                <SelectTrigger id="settings-team-select">
                  <SelectValue placeholder="Session personnelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Session personnelle</SelectItem>
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
                {formSessionTeamId
                  ? 'Les membres de l\'équipe pourront accéder à cette session.'
                  : 'Cette session est uniquement accessible par vous.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily-limit">
                Limite quotidienne de messages IA
              </Label>
              <Input
                id="daily-limit"
                type="number"
                min={1}
                max={100000}
                step={1}
                placeholder="Illimité"
                value={formDailyLimit}
                onChange={(e) => setFormDailyLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nombre maximum de messages envoyés par l&apos;IA par jour pour
                cette session. Laisser vide = pas de limite.
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
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle session WhatsApp</DialogTitle>
            <DialogDescription>
              Créez une nouvelle session WhatsApp. Vous pourrez scanner le QR code ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-select">Équipe (optionnel)</Label>
              <Select value={selectedTeamId || 'personal'} onValueChange={(v) => setSelectedTeamId(v === 'personal' ? '' : v)}>
                <SelectTrigger id="team-select">
                  <SelectValue placeholder="Session personnelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Session personnelle</SelectItem>
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
                {selectedTeamId
                  ? 'Les membres de l\'équipe pourront accéder à cette session selon leurs permissions.'
                  : 'Cette session sera uniquement accessible par vous.'}
              </p>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Créer la session
            </Button>
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
        title="Supprimer la session"
        description={`Êtes-vous sûr de vouloir supprimer la session "${sessionToDelete?.instance_name}" ? Cette action déconnectera le numéro WhatsApp et supprimera toutes les données associées.`}
        loading={deleting === sessionToDelete?.id}
      />
    </div>
  )
}
