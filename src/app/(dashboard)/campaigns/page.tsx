'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/i18n/context'
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
import { fr, enUS } from 'date-fns/locale'
import { BlobLoader } from '@/components/blob-loader'

type CampaignWithAgent = Campaign & {
  relance_agent?: { id: string; name: string } | null
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  scheduled: 'outline',
  running: 'default',
  paused: 'outline',
  completed: 'secondary',
  cancelled: 'destructive',
}

const statusKeys: Record<string, string> = {
  draft: 'campaigns.draft',
  scheduled: 'campaigns.scheduled',
  running: 'campaigns.running',
  paused: 'campaigns.paused',
  completed: 'campaigns.completed',
  cancelled: 'campaigns.cancelled',
}

export default function CampaignsPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
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
      toast.error(t('campaigns.load_error'))
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
        toast.success(t('campaigns.campaign_deleted'))
        setDeleteDialogOpen(false)
        setCampaignToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('campaigns.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.error(json.error || t('campaigns.action_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <BlobLoader size={88} />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="campaigns-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('campaigns.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('campaigns.description')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={t('campaigns.filter_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('campaigns.all_statuses')}</SelectItem>
              <SelectItem value="draft">{t('campaigns.draft')}</SelectItem>
              <SelectItem value="scheduled">{t('campaigns.scheduled')}</SelectItem>
              <SelectItem value="running">{t('campaigns.running')}</SelectItem>
              <SelectItem value="paused">{t('campaigns.paused')}</SelectItem>
              <SelectItem value="completed">{t('campaigns.completed')}</SelectItem>
              <SelectItem value="cancelled">{t('campaigns.cancelled')}</SelectItem>
            </SelectContent>
          </Select>
          <Button data-tour="new-campaign-btn" onClick={() => router.push('/campaigns/new')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t('campaigns.new_campaign')}
          </Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t('campaigns.no_campaigns')}</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              {t('campaigns.no_campaigns_desc')}
            </p>
            <Button className="mt-4" onClick={() => router.push('/campaigns/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('campaigns.create_campaign')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const status = { label: statusKeys[campaign.status] ? t(statusKeys[campaign.status]) : campaign.status, variant: statusVariants[campaign.status] || 'secondary' }
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="space-y-1">
                        <Users className="mx-auto h-4 w-4 text-muted-foreground" />
                        <div className="text-lg font-semibold">{campaign.total_recipients}</div>
                        <div className="text-[10px] text-muted-foreground">{t('campaigns.targets')}</div>
                      </div>
                      <div className="space-y-1">
                        <Send className="mx-auto h-4 w-4 text-blue-500" />
                        <div className="text-lg font-semibold">{campaign.sent_count}</div>
                        <div className="text-[10px] text-muted-foreground">{t('campaigns.sent')}</div>
                      </div>
                      <div className="space-y-1">
                        <CheckCircle className="mx-auto h-4 w-4 text-green-500" />
                        <div className="text-lg font-semibold">{campaign.delivered_count}</div>
                        <div className="text-[10px] text-muted-foreground">{t('campaigns.delivered')}</div>
                      </div>
                      <div className="space-y-1">
                        <MessageSquare className="mx-auto h-4 w-4 text-sky-500" />
                        <div className="text-lg font-semibold">{campaign.replied_count}</div>
                        <div className="text-[10px] text-muted-foreground">{t('campaigns.responses')}</div>
                      </div>
                    </div>

                    {/* Taux de réponse */}
                    {campaign.sent_count > 0 && (
                      <div className="text-xs text-muted-foreground text-center">
                        {t('campaigns.response_rate')} {((campaign.replied_count / campaign.sent_count) * 100).toFixed(1)}%
                        {campaign.failed_count > 0 && (
                          <span className="ml-2 text-destructive">
                            ({campaign.failed_count} {t('campaigns.failures')})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Agent ou template */}
                    <div className="text-xs text-muted-foreground">
                      {campaign.relance_agent ? (
                        <span>{t('campaigns.agent_label')} {campaign.relance_agent.name}</span>
                      ) : campaign.message_template ? (
                        <span className="line-clamp-2">{t('campaigns.template_label')} {campaign.message_template}</span>
                      ) : (
                        <span className="text-destructive">{t('campaigns.no_message')}</span>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {campaign.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('campaigns.scheduled_for')} {new Date(campaign.scheduled_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US')}
                        </span>
                      )}
                      {campaign.started_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('campaigns.started_at')} {formatDistanceToNow(new Date(campaign.started_at), { addSuffix: true, locale: locale === 'fr' ? fr : enUS })}
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
                        {t('campaigns.details')}
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
                          {t('campaigns.start')}
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
                          {t('campaigns.pause')}
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
                          {t('campaigns.resume')}
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
                          {t('common.delete')}
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
                          {t('campaigns.cancel_action')}
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
        title={t('campaigns.delete_title')}
        description={t('campaigns.delete_desc', { name: campaignToDelete?.name || '' })}
        loading={deleting === campaignToDelete?.id}
      />
    </div>
  )
}
