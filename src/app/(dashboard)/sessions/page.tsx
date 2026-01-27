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
import { Input } from '@/components/ui/input'
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
  Check,
  Copy,
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
  const [webhookDialog, setWebhookDialog] = useState<WhatsAppSession | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookSaved, setWebhookSaved] = useState(false)

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

  async function handleWebhookSave() {
    if (!webhookDialog || !webhookUrl.trim()) return
    setWebhookSaving(true)
    setWebhookSaved(false)
    try {
      const res = await fetch(`/api/sessions/${webhookDialog.id}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: `${webhookUrl.trim().replace(/\/$/, '')}/api/webhook/evolution` }),
      })
      const json = await res.json()
      if (res.ok) {
        setWebhookSaved(true)
        toast.success(`Webhook configuré : ${json.data.webhook}`)
      } else {
        toast.error(json.error || 'Erreur lors de la configuration du webhook')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setWebhookSaving(false)
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
                          onClick={() => {
                            setWebhookDialog(session)
                            setWebhookUrl('')
                            setWebhookSaved(false)
                          }}
                        >
                          <Globe className="mr-1 h-3 w-3" />
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

      {/* Webhook Configuration Dialog */}
      <Dialog
        open={!!webhookDialog}
        onOpenChange={(open) => {
          if (!open) {
            setWebhookDialog(null)
            setWebhookUrl('')
            setWebhookSaved(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurer le Webhook</DialogTitle>
            <DialogDescription>
              Pour recevoir les messages WhatsApp, ton app doit être accessible
              depuis internet. Utilise <strong>ngrok</strong> pour créer un tunnel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">1. Ouvre un nouveau terminal et lance :</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono">
                  npx ngrok http 3000
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText('npx ngrok http 3000')
                    toast.success('Commande copiée !')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">
                2. Copie l&apos;URL <code className="rounded bg-muted px-1 text-xs">https://xxxx.ngrok-free.app</code> affichée par ngrok :
              </p>
              <div className="mt-2">
                <Input
                  placeholder="https://abc123.ngrok-free.app"
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value)
                    setWebhookSaved(false)
                  }}
                />
              </div>
            </div>

            {/* Step 3 */}
            <Button
              onClick={handleWebhookSave}
              disabled={!webhookUrl.trim() || webhookSaving}
              className="w-full"
            >
              {webhookSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : webhookSaved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Globe className="mr-2 h-4 w-4" />
              )}
              {webhookSaved ? 'Webhook configuré !' : 'Configurer le webhook'}
            </Button>

            {webhookSaved && (
              <p className="text-center text-xs text-green-600">
                Les messages WhatsApp reçus sur cette session apparaîtront
                maintenant dans Conversations.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
