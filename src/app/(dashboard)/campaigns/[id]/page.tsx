'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslation } from '@/i18n/context'
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
  Sparkles,
  Mail,
  Calendar,
  UserPlus,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { formatDistanceToNow, format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { CampaignContactSelector } from '@/components/campaign-contact-selector'
import { BlobLoaderScreen } from '@/components/blob-loader'

type ContactDetails = {
  id: string
  name: string | null
  phone_number: string
  first_name: string | null
  last_name: string | null
  email: string | null
  notes: string | null
  profile_picture_url: string | null
  created_at: string
  last_message_at: string | null
  ai_summary: string | null
  ai_summary_updated_at: string | null
}

type RecipientWithContact = CampaignRecipient & {
  contact?: Pick<Contact, 'id' | 'name' | 'phone_number'> | null
}

type CampaignWithDetails = Campaign & {
  relance_agent?: { id: string; name: string; system_prompt: string } | null
  recipients?: RecipientWithContact[]
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  scheduled: 'outline',
  running: 'default',
  paused: 'outline',
  completed: 'secondary',
  cancelled: 'destructive',
}

const statusIcons: Record<string, React.ReactNode> = {
  draft: <Pencil className="h-3 w-3" />,
  scheduled: <Clock className="h-3 w-3" />,
  running: <Play className="h-3 w-3" />,
  paused: <Pause className="h-3 w-3" />,
  completed: <CheckCircle className="h-3 w-3" />,
  cancelled: <XCircle className="h-3 w-3" />,
}

const statusKeys: Record<string, string> = {
  draft: 'campaigns.draft',
  scheduled: 'campaigns.scheduled',
  running: 'campaigns.running',
  paused: 'campaigns.paused',
  completed: 'campaigns.completed',
  cancelled: 'campaigns.cancelled',
}

const recipientStatusKeys: Record<string, string> = {
  pending: 'campaigns.pending',
  queued: 'campaigns.queued',
  sending: 'campaigns.sending',
  sent: 'campaigns.sent_status',
  delivered: 'campaigns.delivered_status',
  replied: 'campaigns.replied',
  failed: 'campaigns.failed',
  skipped: 'campaigns.skipped',
}

const recipientStatusColors: Record<string, string> = {
  pending: 'text-muted-foreground',
  queued: 'text-blue-500',
  sending: 'text-yellow-500',
  sent: 'text-blue-500',
  delivered: 'text-green-500',
  replied: 'text-sky-500',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground',
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string
  const { t, locale } = useTranslation()

  const dateFnsLocale = locale === 'fr' ? fr : enUS

  const [campaign, setCampaign] = useState<CampaignWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [contactSheetOpen, setContactSheetOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactDetails | null>(null)
  const [loadingContact, setLoadingContact] = useState(false)
  const [editedContact, setEditedContact] = useState<{
    first_name: string
    last_name: string
    email: string
    notes: string
  }>({ first_name: '', last_name: '', email: '', notes: '' })
  const [savingContact, setSavingContact] = useState(false)
  const [extractingInfo, setExtractingInfo] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [contactSelectorOpen, setContactSelectorOpen] = useState(false)

  const fetchCampaign = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    else setRefreshing(true)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setCampaign(json.data)
      } else {
        toast.error(json.error || t('campaigns.not_found'))
        router.push('/campaigns')
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.error(json.error || t('campaigns.action_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.success(t('campaigns.contacts_added', { count: json.data.added_count }))
        fetchCampaign(false)
      } else {
        toast.error(json.error || t('campaigns.update_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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
        toast.success(t('campaigns.recipients_deleted', { count: json.data.deleted_count }))
        setSelectedRecipients(new Set())
        setDeleteDialogOpen(false)
        fetchCampaign(false)
      } else {
        toast.error(json.error || t('campaigns.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
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

  async function handleViewContact(contactId: string) {
    setLoadingContact(true)
    setContactSheetOpen(true)
    setSelectedContact(null)

    try {
      const res = await fetch(`/api/contacts/${contactId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setSelectedContact(json.data)
        setEditedContact({
          first_name: json.data.first_name || '',
          last_name: json.data.last_name || '',
          email: json.data.email || '',
          notes: json.data.notes || '',
        })
      } else {
        toast.error(json.error || t('contact_profile.load_error'))
        setContactSheetOpen(false)
      }
    } catch {
      toast.error(t('common.network_error'))
      setContactSheetOpen(false)
    } finally {
      setLoadingContact(false)
    }
  }

  async function handleSaveContact() {
    if (!selectedContact) return
    setSavingContact(true)

    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedContact),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSelectedContact(json.data)
        toast.success(t('contact_profile.contact_saved'))
      } else {
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSavingContact(false)
    }
  }

  async function handleExtractInfo() {
    if (!selectedContact) return
    setExtractingInfo(true)

    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}/extract-info`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok && json.data?.extracted) {
        const extracted = json.data.extracted
        const updates: string[] = []

        const newContact = { ...editedContact }
        if (extracted.first_name && !editedContact.first_name.trim()) {
          newContact.first_name = extracted.first_name
          updates.push(t('contact_profile.first_name'))
        }
        if (extracted.last_name && !editedContact.last_name.trim()) {
          newContact.last_name = extracted.last_name
          updates.push(t('contact_profile.last_name'))
        }
        if (extracted.email && !editedContact.email.trim()) {
          newContact.email = extracted.email
          updates.push(t('contact_profile.email'))
        }
        if (extracted.notes && !editedContact.notes.trim()) {
          newContact.notes = extracted.notes
          updates.push(t('contact_profile.notes'))
        }

        setEditedContact(newContact)

        if (updates.length > 0) {
          toast.success(t('contact_profile.info_extracted', { fields: updates.join(', ') }))
        } else {
          toast.info(t('contact_profile.no_new_info'))
        }
      } else {
        toast.error(json.error || t('contact_profile.extract_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setExtractingInfo(false)
    }
  }

  async function handleGenerateSummary() {
    if (!selectedContact) return
    setGeneratingSummary(true)

    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}/summary`, {
        method: 'POST',
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSelectedContact(json.data)
        toast.success(t('contact_profile.summary_generated'))
      } else {
        toast.error(json.error || t('contact_profile.summary_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setGeneratingSummary(false)
    }
  }

  if (loading) {
    return (
      <BlobLoaderScreen />
    )
  }

  if (!campaign) {
    return null
  }

  const status = {
    label: statusKeys[campaign.status] ? t(statusKeys[campaign.status]) : campaign.status,
    variant: statusVariants[campaign.status] || 'secondary',
    icon: statusIcons[campaign.status] || null,
  }
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
              {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true, locale: dateFnsLocale })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
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
              {t('campaigns.start')}
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => handleAction('pause')} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pause className="mr-2 h-4 w-4" />
              )}
              {t('campaigns.pause')}
            </Button>
          )}
          {canResume && (
            <Button onClick={() => handleAction('resume')} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {t('campaigns.resume')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => setCancelDialogOpen(true)}
              disabled={actionLoading}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {t('campaigns.cancel_action')}
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
                <div className="text-xs text-muted-foreground">{t('campaigns.recipients')}</div>
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
                <div className="text-xs text-muted-foreground">{t('campaigns.sent')}</div>
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
                <div className="text-xs text-muted-foreground">{t('campaigns.delivered')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-sky-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{responseRate}%</div>
                <div className="text-xs text-muted-foreground">{t('campaigns.response_rate').replace(':', '').trim()}</div>
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
              <span className="font-medium">{t('campaigns.failed_messages', { count: campaign.failed_count })}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('campaigns.configuration')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.message')}</span>
              <span>
                {campaign.relance_agent
                  ? `${t('campaigns.agent_label')} ${campaign.relance_agent.name}`
                  : t('campaigns.fixed_template')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.max_recipients_label')}</span>
              <span>{campaign.max_recipients}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.delay_between')}</span>
              <span>{campaign.delay_between_min}–{campaign.delay_between_max}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.messages_per_hour', { count: '' }).replace(': ', '')}</span>
              <span>{campaign.messages_per_hour}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.send_range')}</span>
              <span>{campaign.send_hour_start}h – {campaign.send_hour_end}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('campaigns.min_inactivity')}</span>
              <span>{campaign.filter_inactivity_days || t('common.none')} {locale === 'fr' ? 'jours' : 'days'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('campaigns.history')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {campaign.scheduled_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('campaigns.scheduled_for_label')}</span>
                <span>{format(new Date(campaign.scheduled_at), 'dd/MM/yyyy HH:mm', { locale: dateFnsLocale })}</span>
              </div>
            )}
            {campaign.started_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('campaigns.started_label')}</span>
                <span>{format(new Date(campaign.started_at), 'dd/MM/yyyy HH:mm', { locale: dateFnsLocale })}</span>
              </div>
            )}
            {campaign.paused_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('campaigns.paused_since')}</span>
                <span>{format(new Date(campaign.paused_at), 'dd/MM/yyyy HH:mm', { locale: dateFnsLocale })}</span>
              </div>
            )}
            {campaign.pause_reason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('campaigns.reason')}</span>
                <span>{campaign.pause_reason}</span>
              </div>
            )}
            {campaign.completed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('campaigns.completed_label')}</span>
                <span>{format(new Date(campaign.completed_at), 'dd/MM/yyyy HH:mm', { locale: dateFnsLocale })}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template message si pas d'agent */}
      {campaign.message_template && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">{t('campaigns.message_template_title')}</CardTitle>
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
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">{t('campaigns.recipients')}</CardTitle>
            <CardDescription>
              {t('campaigns.contacts_label', { count: campaign.recipients?.length || 0 })}
              {selectedRecipients.size > 0 && (
                <span className="ml-2 text-primary">
                  ({t('common.x_selected', { count: selectedRecipients.size })})
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
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
                {t('common.delete')} ({selectedRecipients.size})
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContactSelectorOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('campaigns.manage_prospects')}
                </Button>
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
                  {t('campaigns.auto_add')}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!campaign.recipients || campaign.recipients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-8 w-8 mb-2" />
              <p>{t('campaigns.no_recipients')}</p>
              {canRefreshRecipients && (
                <div className="flex flex-col gap-2 mt-4">
                  <Button
                    onClick={() => setContactSelectorOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t('campaigns.select_prospects')}
                  </Button>
                  <Button
                    variant="link"
                    onClick={handleRefreshRecipients}
                    disabled={refreshing}
                  >
                    {t('campaigns.or_auto_add')}
                  </Button>
                </div>
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
                          aria-label={t('campaigns.select_all')}
                        />
                      </TableHead>
                    )}
                    <TableHead>{t('campaigns.contact')}</TableHead>
                    <TableHead>{t('campaigns.status')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('campaigns.sent_label')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('campaigns.message')}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaign.recipients.map((recipient) => {
                    const recipientStatus = {
                      label: recipientStatusKeys[recipient.status] ? t(recipientStatusKeys[recipient.status]) : recipient.status,
                      color: recipientStatusColors[recipient.status] || '',
                    }
                    const isSelected = selectedRecipients.has(recipient.id)

                    return (
                      <TableRow key={recipient.id} className={isSelected ? 'bg-muted/50' : ''}>
                        {canEdit && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRecipient(recipient.id)}
                              aria-label={`${t('campaigns.select_all')} ${recipient.contact?.name || t('campaigns.contact')}`}
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
                                {recipient.contact?.name || t('common.no_name')}
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
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                          {recipient.sent_at
                            ? format(new Date(recipient.sent_at), 'dd/MM HH:mm', { locale: dateFnsLocale })
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] hidden md:table-cell">
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
                              onClick={() => handleViewContact(recipient.contact!.id)}
                              title={t('contact_profile.title')}
                            >
                              <User className="h-4 w-4" />
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
        title={t('campaigns.cancel_campaign_title')}
        description={t('campaigns.cancel_campaign_desc')}
        loading={actionLoading}
        confirmText={t('campaigns.cancel_confirm')}
      />

      {/* Confirm Delete Recipients Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteRecipients}
        title={t('campaigns.delete_recipients_title')}
        description={t('campaigns.delete_recipients_desc', { count: selectedRecipients.size })}
        loading={deleting}
        confirmText={t('common.delete')}
      />

      {/* Contact Profile Sheet */}
      <Sheet open={contactSheetOpen} onOpenChange={setContactSheetOpen}>
        <SheetContent className="sm:max-w-md p-0 flex flex-col h-full">
          {loadingContact ? (
            <BlobLoaderScreen />
          ) : selectedContact ? (
            <>
              {/* Header avec avatar */}
              <div className="bg-primary p-4 text-primary-foreground">
                <div className="flex items-center gap-3">
                  {selectedContact.profile_picture_url ? (
                    <img
                      src={selectedContact.profile_picture_url}
                      alt={selectedContact.name || t('campaigns.contact')}
                      className="h-12 w-12 rounded-full object-cover border-2 border-primary-foreground/20"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary-foreground/20 flex items-center justify-center text-lg font-semibold">
                      {(selectedContact.name || selectedContact.phone_number)?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">
                      {selectedContact.name || t('common.no_name')}
                    </h3>
                    <p className="text-sm opacity-80">
                      +{selectedContact.phone_number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs opacity-80">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(selectedContact.created_at), 'dd MMM yyyy', { locale: dateFnsLocale })}
                  </span>
                  {selectedContact.last_message_at && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {formatDistanceToNow(new Date(selectedContact.last_message_at), { addSuffix: true, locale: dateFnsLocale })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-6">
                  {/* Section Informations */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {t('contact_profile.information')}
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExtractInfo}
                        disabled={extractingInfo}
                      >
                        {extractingInfo ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-3 w-3" />
                        )}
                        {t('contact_profile.complete_ai')}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="first_name" className="text-xs text-muted-foreground">
                          {t('contact_profile.first_name')}
                        </Label>
                        <Input
                          id="first_name"
                          value={editedContact.first_name}
                          onChange={(e) => setEditedContact({ ...editedContact, first_name: e.target.value })}
                          placeholder={t('contact_profile.first_name_placeholder')}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="last_name" className="text-xs text-muted-foreground">
                          {t('contact_profile.last_name')}
                        </Label>
                        <Input
                          id="last_name"
                          value={editedContact.last_name}
                          onChange={(e) => setEditedContact({ ...editedContact, last_name: e.target.value })}
                          placeholder={t('contact_profile.last_name_placeholder')}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <Label htmlFor="email" className="text-xs text-muted-foreground">
                        {t('contact_profile.email')}
                      </Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={editedContact.email}
                          onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
                          placeholder={t('contact_profile.email_placeholder')}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <Label htmlFor="notes" className="text-xs text-muted-foreground">
                        {t('contact_profile.notes')}
                      </Label>
                      <Textarea
                        id="notes"
                        value={editedContact.notes}
                        onChange={(e) => setEditedContact({ ...editedContact, notes: e.target.value })}
                        placeholder={t('contact_profile.notes_placeholder')}
                        className="mt-1 min-h-[80px]"
                      />
                    </div>

                    <Button
                      onClick={handleSaveContact}
                      disabled={savingContact}
                      className="w-full mt-3"
                      size="sm"
                    >
                      {savingContact ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      )}
                      {t('common.save')}
                    </Button>
                  </div>

                  <Separator />

                  {/* Section Résumé IA */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        {t('contact_profile.ai_summary')}
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateSummary}
                        disabled={generatingSummary}
                      >
                        {generatingSummary ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3 w-3" />
                        )}
                        {selectedContact.ai_summary ? t('contact_profile.regenerate') : t('contact_profile.generate')}
                      </Button>
                    </div>

                    {selectedContact.ai_summary ? (
                      <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert">
                        {selectedContact.ai_summary}
                      </div>
                    ) : (
                      <div className="bg-muted rounded-lg p-4 text-center text-sm text-muted-foreground">
                        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>{t('contact_profile.summary_empty')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setContactSheetOpen(false)
                    router.push(`/conversations?contact=${selectedContact.id}`)
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('contact_profile.view_conversation')}
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Contact Selector Dialog */}
      <CampaignContactSelector
        open={contactSelectorOpen}
        onOpenChange={setContactSelectorOpen}
        campaignId={campaignId}
        onContactsUpdated={() => fetchCampaign(false)}
      />
    </div>
  )
}
