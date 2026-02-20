'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WALink, WhatsAppSession, AIAgent, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { toast } from 'sonner'
import {
  Plus,
  Link2,
  Copy,
  Trash2,
  Pencil,
  Loader2,
  MousePointerClick,
  ExternalLink,
  Bot,
  Users,
  RotateCcw,
} from 'lucide-react'
import { MultiTeamSelect } from '@/components/multi-team-select'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { getSessionDisplayName } from '@/lib/format-phone'
import { useTranslation } from '@/i18n/context'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }

type WALinkWithSession = WALink & {
  whatsapp_sessions: {
    phone_number: string | null
    instance_name: string
    display_name: string | null
    status: string
  } | null
  team_ids?: string[]
}

export default function LinksPage() {
  const { t } = useTranslation()
  const [links, setLinks] = useState<WALinkWithSession[]>([])
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WALinkWithSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [linkToDelete, setLinkToDelete] = useState<WALinkWithSession | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)

  // Form state
  const [formTeamIds, setFormTeamIds] = useState<string[]>([])
  const [formName, setFormName] = useState('')
  const [formSessionId, setFormSessionId] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formAgentId, setFormAgentId] = useState('')

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/links')
      const json = await res.json()
      if (res.ok && json.data) {
        setLinks(json.data)
      }
    } catch {
      toast.error(t('links.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok && json.data) {
        setSessions(json.data.filter((s: WhatsAppSession) => s.status === 'connected'))
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data.filter((a: AIAgent) => a.is_active))
      }
    } catch {
      // silently ignore
    }
  }, [])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams(json.data.filter((tm: TeamWithRole) => tm.my_role === 'owner' || tm.my_role === 'admin'))
      }
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    fetchLinks()
    fetchSessions()
    fetchAgents()
    fetchTeams()
  }, [fetchLinks, fetchSessions, fetchAgents, fetchTeams])

  function openCreateDialog() {
    setEditing(null)
    setFormTeamIds([])
    setFormName('')
    setFormSessionId('')
    setFormMessage('')
    setFormSource('')
    setFormSlug('')
    setFormAgentId('')
    setDialogOpen(true)
  }

  function openEditDialog(link: WALinkWithSession) {
    setEditing(link)
    setFormTeamIds(link.team_ids || (link.team_id ? [link.team_id] : []))
    setFormName(link.name)
    setFormSessionId(link.session_id)
    setFormMessage(link.pre_filled_message || '')
    setFormSource(link.tracking_source || '')
    setFormSlug(link.slug || '')
    setFormAgentId(link.ai_agent_id || '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formSessionId) {
      toast.error(t('links.name_required'))
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/links/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            pre_filled_message: formMessage.trim(),
            tracking_source: formSource.trim(),
            slug: formSlug.trim(),
            ai_agent_id: formAgentId || null,
            team_ids: formTeamIds,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setLinks((prev) => prev.map((l) => (l.id === editing.id ? json.data : l)))
          toast.success(t('links.link_edited'))
          setDialogOpen(false)
        } else {
          toast.error(json.error || t('links.edit_error'))
        }
      } else {
        const res = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            session_id: formSessionId,
            pre_filled_message: formMessage.trim(),
            tracking_source: formSource.trim(),
            slug: formSlug.trim(),
            ai_agent_id: formAgentId || null,
            team_ids: formTeamIds,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setLinks((prev) => [json.data, ...prev])
          toast.success(t('links.link_created'))
          setDialogOpen(false)
        } else {
          toast.error(json.error || t('links.create_error'))
        }
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  function openDeleteDialog(link: WALinkWithSession) {
    setLinkToDelete(link)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!linkToDelete) return
    setDeleting(linkToDelete.id)
    try {
      const res = await fetch(`/api/links/${linkToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkToDelete.id))
        toast.success(t('links.link_deleted'))
        setDeleteDialogOpen(false)
        setLinkToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('links.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleActive(link: WALinkWithSession) {
    try {
      const res = await fetch(`/api/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !link.is_active }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setLinks((prev) => prev.map((l) => (l.id === link.id ? json.data : l)))
        toast.success(json.data.is_active ? t('links.link_enabled') : t('links.link_disabled'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleResetClicks(link: WALinkWithSession) {
    setResetting(link.id)
    try {
      const res = await fetch(`/api/links/${link.id}/reset-clicks`, { method: 'POST' })
      if (res.ok) {
        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, click_count: 0 } : l)))
        toast.success(t('links.clicks_reset'))
      } else {
        const json = await res.json()
        toast.error(json.error || t('common.network_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setResetting(null)
    }
  }

  function getPublicUrl(slug: string) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/api/wa/${slug}`
  }

  function getDirectWaUrl(link: WALinkWithSession) {
    const phone = link.whatsapp_sessions?.phone_number
    if (!phone) return null
    let url = `https://wa.me/${phone}`
    if (link.pre_filled_message) {
      url += `?text=${encodeURIComponent(link.pre_filled_message)}`
    }
    return url
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(getPublicUrl(slug))
    toast.success(t('links.link_copied'))
  }

  function copyDirectLink(link: WALinkWithSession) {
    const url = getDirectWaUrl(link)
    if (url) {
      navigator.clipboard.writeText(url)
      toast.success(t('links.wame_copied'))
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
        <div data-tour="links-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('links.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('links.description')}
          </p>
        </div>
        <Button data-tour="new-link-btn" onClick={openCreateDialog} disabled={sessions.length === 0} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t('links.new_link')}
        </Button>
      </div>

      {sessions.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              {t('links.no_sessions')}
            </p>
          </CardContent>
        </Card>
      )}

      {links.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Link2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t('links.no_links')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('links.no_links_desc')}
            </p>
            {sessions.length > 0 && (
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                {t('links.create_link')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const session = link.whatsapp_sessions
            const phone = session?.phone_number
            const isDeleting = deleting === link.id

            return (
              <Card key={link.id} className={!link.is_active ? 'opacity-60' : ''}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    {link.name}
                  </CardTitle>
                  <Badge variant={link.is_active ? 'default' : 'secondary'} className="w-fit">
                    {link.is_active ? t('common.active') : t('common.inactive')}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <span>{session ? getSessionDisplayName({ display_name: session.display_name, phone_number: session.phone_number, instance_name: session.instance_name }) : t('links.unknown_session')}</span>
                      {(link.team_ids?.length || link.team_id) && (
                        <>
                          {(link.team_ids || (link.team_id ? [link.team_id] : [])).map(tid => (
                            <Badge key={tid} variant="outline" className="gap-1 text-xs font-normal">
                              <Users className="h-3 w-3" />
                              {teams.find(tm => tm.id === tid)?.name || t('common.team')}
                            </Badge>
                          ))}
                        </>
                      )}
                    </div>

                    {link.pre_filled_message && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t('links.message_label')} {link.pre_filled_message}
                      </p>
                    )}

                    {link.tracking_source && (
                      <p className="text-xs text-muted-foreground">
                        {t('links.source_label')} {link.tracking_source}
                      </p>
                    )}

                    {link.ai_agent_id && (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs text-violet-600 border-violet-300">
                          <Bot className="mr-1 h-3 w-3" />
                          {agents.find((a) => a.id === link.ai_agent_id)?.name || t('links.agent_label')}
                        </Badge>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MousePointerClick className="h-3 w-3" />
                        {t('links.clicks', { count: String(link.click_count) })}
                      </div>
                      {link.click_count > 0 && (
                        <button
                          onClick={() => handleResetClicks(link)}
                          disabled={resetting === link.id}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title={t('links.reset_clicks')}
                        >
                          {resetting === link.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          {t('links.reset')}
                        </button>
                      )}
                    </div>

                    {link.slug && (
                      <code className="block text-xs bg-muted px-2 py-0.5 rounded truncate">
                        /api/wa/{link.slug}
                      </code>
                    )}

                    {phone && (
                      <code className="block text-xs bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded truncate text-green-700 dark:text-green-300">
                        wa.me/{phone}
                      </code>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(link.slug!)}
                      disabled={!link.slug}
                      title={t('links.copy_tracking')}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {t('links.tracking')}
                    </Button>
                    {phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyDirectLink(link)}
                        className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
                        title={t('links.copy_wame')}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {t('links.wame')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(getPublicUrl(link.slug!), '_blank')}
                      disabled={!link.slug || !link.is_active}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {t('common.test')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(link)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(link)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                    <div className="ml-auto">
                      <Switch
                        checked={link.is_active}
                        onCheckedChange={() => handleToggleActive(link)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('links.edit_title') : t('links.new_title')}</DialogTitle>
            <DialogDescription>
              {editing
                ? t('links.edit_desc')
                : t('links.new_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <MultiTeamSelect
              teams={teams}
              selectedTeamIds={formTeamIds}
              onTeamIdsChange={setFormTeamIds}
              label={t('common.teams')}
              description={t('links.teams_desc')}
              emptyDescription={t('links.teams_empty')}
            />

            <div className="space-y-2">
              <Label htmlFor="link-name">{t('links.name_label')}</Label>
              <Input
                id="link-name"
                placeholder={t('links.name_placeholder')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="link-session">{t('links.session_label')}</Label>
                <Select value={formSessionId} onValueChange={setFormSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('links.session_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {getSessionDisplayName({ display_name: s.display_name, phone_number: s.phone_number, instance_name: s.instance_name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="link-message">{t('links.prefill_message')}</Label>
              <Textarea
                id="link-message"
                placeholder={t('links.prefill_placeholder')}
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-source">{t('links.tracking_source')}</Label>
              <Input
                id="link-source"
                placeholder={t('links.tracking_placeholder')}
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-slug">{t('links.slug_label')}</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">/api/wa/</span>
                <Input
                  id="link-slug"
                  placeholder={t('links.slug_placeholder')}
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-agent">{t('links.agent_label')}</Label>
              <Select value={formAgentId || 'none'} onValueChange={(val) => setFormAgentId(val === 'none' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.no_agent')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.no_agent')}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <Bot className="mr-1 inline h-3 w-3" />
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('links.agent_help')}
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || (!editing && !formSessionId)}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              {editing ? t('common.save') : t('links.create_btn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setLinkToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('links.delete_title')}
        description={t('links.delete_desc', { name: linkToDelete?.name || '' })}
        loading={deleting === linkToDelete?.id}
      />
    </div>
  )
}
