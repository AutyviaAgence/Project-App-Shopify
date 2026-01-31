'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Campaign } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Loader2,
  Megaphone,
  Play,
  Pause,
  Eye,
  Trash2,
  Users,
  Send,
  CheckCircle,
  MessageSquare,
  XCircle,
  Clock,
  Calendar,
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

type CampaignWithAgent = Campaign & {
  relance_agent?: { id: string; name: string } | null
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  scheduled: { label: 'Programmée', variant: 'outline' },
  running: { label: 'En cours', variant: 'default' },
  paused: { label: 'En pause', variant: 'outline' },
  completed: { label: 'Terminée', variant: 'secondary' },
  cancelled: { label: 'Annulée', variant: 'destructive' },
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignWithAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignWithAgent | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    try {
      const url = statusFilter === 'all'
        ? '/api/campaigns'
        : `/api/campaigns?status=${statusFilter}`
      const res = await fetch(url)
      const json = await res.json()
      if (res.ok && json.data) {
        setCampaigns(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des campagnes')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    setLoading(true)
    fetchCampaigns()
  }, [fetchCampaigns])

  function openDeleteDialog(campaign: CampaignWithAgent) {
    setCampaignToDelete(campaign)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!campaignToDelete) return
    setDeleting(campaignToDelete.id)
    try {
      const res = await fetch(`/api/campaigns/${campaignToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== campaignToDelete.id))
        toast.success('Campagne supprimée')
        setDeleteDialogOpen(false)
        setCampaignToDelete(null)
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

  async function handleAction(campaignId: string, action: 'start' | 'pause' | 'resume' | 'cancel') {
    setActionLoading(campaignId)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, ...json.data } : c))
        toast.success(json.message)
      } else {
        toast.error(json.error || 'Erreur lors de l\'action')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setActionLoading(null)
    }
  }

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
          <h1 className="text-xl sm:text-2xl font-bold">Campagnes de relance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Relancez vos contacts inactifs avec des messages personnalisés.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillons</SelectItem>
              <SelectItem value="scheduled">Programmées</SelectItem>
              <SelectItem value="running">En cours</SelectItem>
              <SelectItem value="paused">En pause</SelectItem>
              <SelectItem value="completed">Terminées</SelectItem>
              <SelectItem value="cancelled">Annulées</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => router.push('/campaigns/new')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle campagne
          </Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucune campagne</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              Créez votre première campagne pour relancer vos contacts inactifs.
            </p>
            <Button className="mt-4" onClick={() => router.push('/campaigns/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Créer une campagne
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const status = statusLabels[campaign.status] || { label: campaign.status, variant: 'secondary' as const }
            const isLoading = actionLoading === campaign.id
            const canStart = campaign.status === 'draft' || campaign.status === 'scheduled'
            const canPause = campaign.status === 'running'
            const canResume = campaign.status === 'paused'

            return (
              <Card key={campaign.id}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    <Megaphone className="mr-1 inline h-4 w-4" />
                    {campaign.name}
                  </CardTitle>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="space-y-1">
                        <Users className="mx-auto h-4 w-4 text-muted-foreground" />
                        <div className="text-lg font-semibold">{campaign.total_recipients}</div>
                        <div className="text-[10px] text-muted-foreground">Cibles</div>
                      </div>
                      <div className="space-y-1">
                        <Send className="mx-auto h-4 w-4 text-blue-500" />
                        <div className="text-lg font-semibold">{campaign.sent_count}</div>
                        <div className="text-[10px] text-muted-foreground">Envoyés</div>
                      </div>
                      <div className="space-y-1">
                        <CheckCircle className="mx-auto h-4 w-4 text-green-500" />
                        <div className="text-lg font-semibold">{campaign.delivered_count}</div>
                        <div className="text-[10px] text-muted-foreground">Reçus</div>
                      </div>
                      <div className="space-y-1">
                        <MessageSquare className="mx-auto h-4 w-4 text-purple-500" />
                        <div className="text-lg font-semibold">{campaign.replied_count}</div>
                        <div className="text-[10px] text-muted-foreground">Réponses</div>
                      </div>
                    </div>

                    {/* Taux de réponse */}
                    {campaign.sent_count > 0 && (
                      <div className="text-xs text-muted-foreground text-center">
                        Taux de réponse : {((campaign.replied_count / campaign.sent_count) * 100).toFixed(1)}%
                        {campaign.failed_count > 0 && (
                          <span className="ml-2 text-destructive">
                            ({campaign.failed_count} échecs)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Agent ou template */}
                    <div className="text-xs text-muted-foreground">
                      {campaign.relance_agent ? (
                        <span>Agent : {campaign.relance_agent.name}</span>
                      ) : campaign.message_template ? (
                        <span className="line-clamp-2">Template : {campaign.message_template}</span>
                      ) : (
                        <span className="text-destructive">Pas de message configuré</span>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {campaign.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Programmée : {new Date(campaign.scheduled_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      {campaign.started_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Démarrée {formatDistanceToNow(new Date(campaign.started_at), { addSuffix: true, locale: fr })}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/campaigns/${campaign.id}`)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Détails
                      </Button>

                      {canStart && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction(campaign.id, 'start')}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Démarrer
                        </Button>
                      )}

                      {canPause && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction(campaign.id, 'pause')}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Pause className="mr-1 h-3 w-3" />
                          )}
                          Pause
                        </Button>
                      )}

                      {canResume && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAction(campaign.id, 'resume')}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Reprendre
                        </Button>
                      )}

                      {campaign.status !== 'running' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(campaign)}
                          disabled={deleting === campaign.id}
                        >
                          {deleting === campaign.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-3 w-3" />
                          )}
                          Supprimer
                        </Button>
                      )}

                      {(campaign.status === 'running' || campaign.status === 'paused') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleAction(campaign.id, 'cancel')}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="mr-1 h-3 w-3" />
                          )}
                          Annuler
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setCampaignToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Supprimer la campagne"
        description={`Êtes-vous sûr de vouloir supprimer la campagne "${campaignToDelete?.name}" ? Cette action est irréversible.`}
        loading={deleting === campaignToDelete?.id}
      />
    </div>
  )
}
