'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WhatsAppSession } from '@/types/database'
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
} from 'lucide-react'

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
  const [qrSession, setQrSession] = useState<WhatsAppSession | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [webhookConfiguring, setWebhookConfiguring] = useState<string | null>(null)

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

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

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

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/sessions', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Erreur lors de la création')
        return
      }
      const newSession = json.data as WhatsAppSession
      setSessions((prev) => [newSession, ...prev])
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

  async function handleDelete(sessionId: string) {
    setDeleting(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/disconnect`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        toast.success('Session supprimée')
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos connexions WhatsApp. Chaque session correspond à un numéro.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
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
            <Button className="mt-4" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {session.phone_number
                      ? `+${session.phone_number}`
                      : session.instance_name}
                  </CardTitle>
                  <Badge variant={config.variant}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {config.label}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Créée le{' '}
                    {new Date(session.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>

                  <div className="mt-4 flex gap-2">
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
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(session.id)}
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

    </div>
  )
}
