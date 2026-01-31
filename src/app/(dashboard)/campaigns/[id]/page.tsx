'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Campaign, CampaignRecipient, Contact } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Loader2,
  ArrowLeft,
  Megaphone,
  Play,
  Pause,
  XCircle,
  Users,
  Send,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  Clock,
  RefreshCw,
  Pencil,
  User,
  Phone,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

type RecipientWithContact = CampaignRecipient & {
  contact?: Pick<Contact, 'id' | 'name' | 'phone_number'> | null
}

type CampaignWithDetails = Campaign & {
  relance_agent?: { id: string; name: string; system_prompt: string } | null
  recipients?: RecipientWithContact[]
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  draft: { label: 'Brouillon', variant: 'secondary', icon: <Pencil className="h-3 w-3" /> },
  scheduled: { label: 'Programmée', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  running: { label: 'En cours', variant: 'default', icon: <Play className="h-3 w-3" /> },
  paused: { label: 'En pause', variant: 'outline', icon: <Pause className="h-3 w-3" /> },
  completed: { label: 'Terminée', variant: 'secondary', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Annulée', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

const recipientStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'text-muted-foreground' },
  queued: { label: 'En file', color: 'text-blue-500' },
  sending: { label: 'Envoi...', color: 'text-yellow-500' },
  sent: { label: 'Envoyé', color: 'text-blue-500' },
  delivered: { label: 'Reçu', color: 'text-green-500' },
  replied: { label: 'Répondu', color: 'text-purple-500' },
  failed: { label: 'Échec', color: 'text-destructive' },
  skipped: { label: 'Ignoré', color: 'text-muted-foreground' },
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<CampaignWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchCampaign = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    else setRefreshing(true)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setCampaign(json.data)
      } else {
        toast.error(json.error || 'Campagne non trouvée')
        router.push('/campaigns')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [campaignId, router])

  useEffect(() => {
    fetchCampaign()
  }, [fetchCampaign])

  // Auto-refresh si la campagne est en cours
  useEffect(() => {
    if (campaign?.status === 'running') {
      const interval = setInterval(() => fetchCampaign(false), 10000)
      return () => clearInterval(interval)
    }
  }, [campaign?.status, fetchCampaign])

  async function handleAction(action: 'start' | 'pause' | 'resume' | 'cancel') {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setCampaign((prev) => prev ? { ...prev, ...json.data } : null)
        toast.success(json.message)
        if (action === 'cancel') {
          setCancelDialogOpen(false)
        }
      } else {
        toast.error(json.error || 'Erreur lors de l\'action')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRefreshRecipients() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preview`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok && json.data) {
        toast.success(`${json.data.added_count} contacts ajoutés`)
        fetchCampaign(false)
      } else {
        toast.error(json.error || 'Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleDeleteRecipients() {
    if (selectedRecipients.size === 0) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/recipients`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_ids: Array.from(selectedRecipients) }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        toast.success(`${json.data.deleted_count} destinataire(s) supprimé(s)`)
        setSelectedRecipients(new Set())
        setDeleteDialogOpen(false)
        fetchCampaign(false)
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setDeleting(false)
    }
  }

  function toggleRecipient(recipientId: string) {
    setSelectedRecipients((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(recipientId)) {
        newSet.delete(recipientId)
      } else {
        newSet.add(recipientId)
      }
      return newSet
    })
  }

  function toggleAllRecipients() {
    if (!campaign?.recipients) return

    if (selectedRecipients.size === campaign.recipients.length) {
      setSelectedRecipients(new Set())
    } else {
      setSelectedRecipients(new Set(campaign.recipients.map((r) => r.id)))
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

  const status = statusLabels[campaign.status] || { label: campaign.status, variant: 'secondary' as const, icon: null }
  const canStart = campaign.status === 'draft' || campaign.status === 'scheduled'
  const canPause = campaign.status === 'running'
  const canResume = campaign.status === 'paused'
  const canCancel = campaign.status === 'running' || campaign.status === 'paused'
  const canEdit = campaign.status === 'draft' || campaign.status === 'scheduled'
  const canRefreshRecipients = campaign.status === 'draft'

  const responseRate = campaign.sent_count > 0
    ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1)
    : '0'

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/campaigns')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">{campaign.name}</h1>
              <Badge variant={status.variant} className="gap-1">
                {status.icon}
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Créée {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true, locale: fr })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          )}
          {canStart && (
            <Button
              onClick={() => handleAction('start')}
              disabled={actionLoading || campaign.total_recipients === 0}
            >
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Démarrer
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => handleAction('pause')} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pause className="mr-2 h-4 w-4" />
              )}
              Pause
            </Button>
          )}
          {canResume && (
            <Button onClick={() => handleAction('resume')} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Reprendre
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => setCancelDialogOpen(true)}
              disabled={actionLoading}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Annuler
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-muted rounded-lg">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{campaign.total_recipients}</div>
                <div className="text-xs text-muted-foreground">Destinataires</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{campaign.sent_count}</div>
                <div className="text-xs text-muted-foreground">Envoyés</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{campaign.delivered_count}</div>
                <div className="text-xs text-muted-foreground">Délivrés</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{responseRate}%</div>
                <div className="text-xs text-muted-foreground">Taux de réponse</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Erreurs */}
      {campaign.failed_count > 0 && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{campaign.failed_count} messages en échec</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Message</span>
              <span>
                {campaign.relance_agent
                  ? `Agent: ${campaign.relance_agent.name}`
                  : 'Template fixe'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max destinataires</span>
              <span>{campaign.max_recipients}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Délai entre messages</span>
              <span>{campaign.delay_between_min}–{campaign.delay_between_max}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Messages/heure</span>
              <span>{campaign.messages_per_hour}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plage horaire</span>
              <span>{campaign.send_hour_start}h – {campaign.send_hour_end}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inactivité min</span>
              <span>{campaign.filter_inactivity_days || 'Non défini'} jours</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {campaign.scheduled_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Programmée pour</span>
                <span>{format(new Date(campaign.scheduled_at), 'dd/MM/yyyy HH:mm', { locale: fr })}</span>
              </div>
            )}
            {campaign.started_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Démarrée</span>
                <span>{format(new Date(campaign.started_at), 'dd/MM/yyyy HH:mm', { locale: fr })}</span>
              </div>
            )}
            {campaign.paused_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">En pause depuis</span>
                <span>{format(new Date(campaign.paused_at), 'dd/MM/yyyy HH:mm', { locale: fr })}</span>
              </div>
            )}
            {campaign.pause_reason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Raison</span>
                <span>{campaign.pause_reason}</span>
              </div>
            )}
            {campaign.completed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Terminée</span>
                <span>{format(new Date(campaign.completed_at), 'dd/MM/yyyy HH:mm', { locale: fr })}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template message si pas d'agent */}
      {campaign.message_template && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Message template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap text-sm">
              {campaign.message_template}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste des destinataires */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Destinataires</CardTitle>
            <CardDescription>
              {campaign.recipients?.length || 0} contacts
              {selectedRecipients.size > 0 && (
                <span className="ml-2 text-primary">
                  ({selectedRecipients.size} sélectionné{selectedRecipients.size > 1 ? 's' : ''})
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {selectedRecipients.size > 0 && canEdit && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Supprimer ({selectedRecipients.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchCampaign(false)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            {canRefreshRecipients && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshRecipients}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Users className="mr-2 h-4 w-4" />
                )}
                Actualiser les contacts
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!campaign.recipients || campaign.recipients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-8 w-8 mb-2" />
              <p>Aucun destinataire</p>
              {canRefreshRecipients && (
                <Button
                  variant="link"
                  onClick={handleRefreshRecipients}
                  disabled={refreshing}
                >
                  Ajouter des contacts éligibles
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canEdit && (
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={
                            campaign.recipients.length > 0 &&
                            selectedRecipients.size === campaign.recipients.length
                          }
                          onCheckedChange={toggleAllRecipients}
                          aria-label="Sélectionner tout"
                        />
                      </TableHead>
                    )}
                    <TableHead>Contact</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Envoyé</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaign.recipients.map((recipient) => {
                    const recipientStatus = recipientStatusLabels[recipient.status] || { label: recipient.status, color: '' }
                    const isSelected = selectedRecipients.has(recipient.id)

                    return (
                      <TableRow key={recipient.id} className={isSelected ? 'bg-muted/50' : ''}>
                        {canEdit && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRecipient(recipient.id)}
                              aria-label={`Sélectionner ${recipient.contact?.name || 'contact'}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-muted rounded-full">
                              <User className="h-3 w-3" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {recipient.contact?.name || 'Sans nom'}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {recipient.contact?.phone_number}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${recipientStatus.color}`}>
                            {recipientStatus.label}
                          </span>
                          {recipient.error_message && (
                            <div className="text-xs text-destructive mt-1">
                              {recipient.error_message}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {recipient.sent_at
                            ? format(new Date(recipient.sent_at), 'dd/MM HH:mm', { locale: fr })
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {recipient.message_sent ? (
                            <span className="text-xs truncate block" title={recipient.message_sent}>
                              {recipient.message_sent.substring(0, 50)}...
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {recipient.contact?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/conversations?contact=${recipient.contact?.id}`)}
                              title="Voir le profil"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Cancel Dialog */}
      <ConfirmDeleteDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={() => handleAction('cancel')}
        title="Annuler la campagne"
        description="Êtes-vous sûr de vouloir annuler cette campagne ? Les messages non envoyés seront abandonnés."
        loading={actionLoading}
        confirmText="Annuler la campagne"
      />

      {/* Confirm Delete Recipients Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteRecipients}
        title="Supprimer les destinataires"
        description={`Êtes-vous sûr de vouloir supprimer ${selectedRecipients.size} destinataire(s) de cette campagne ?`}
        loading={deleting}
        confirmText="Supprimer"
      />
    </div>
  )
}
