'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WALink, WhatsAppSession, AIAgent } from '@/types/database'
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
} from 'lucide-react'

type WALinkWithSession = WALink & {
  whatsapp_sessions: {
    phone_number: string | null
    instance_name: string
    status: string
  } | null
}

export default function LinksPage() {
  const [links, setLinks] = useState<WALinkWithSession[]>([])
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WALinkWithSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
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
      toast.error('Erreur lors du chargement des liens')
    } finally {
      setLoading(false)
    }
  }, [])

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

  useEffect(() => {
    fetchLinks()
    fetchSessions()
    fetchAgents()
  }, [fetchLinks, fetchSessions, fetchAgents])

  function openCreateDialog() {
    setEditing(null)
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
      toast.error('Nom et session sont requis')
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
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setLinks((prev) => prev.map((l) => (l.id === editing.id ? json.data : l)))
          toast.success('Lien modifié')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la modification')
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
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setLinks((prev) => [json.data, ...prev])
          toast.success('Lien créé')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la création')
        }
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/links/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== id))
        toast.success('Lien supprimé')
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
        toast.success(json.data.is_active ? 'Lien activé' : 'Lien désactivé')
      }
    } catch {
      toast.error('Erreur réseau')
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
    toast.success('Lien copié !')
  }

  function copyDirectLink(link: WALinkWithSession) {
    const url = getDirectWaUrl(link)
    if (url) {
      navigator.clipboard.writeText(url)
      toast.success('Lien wa.me direct copié !')
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Liens WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez des liens wa.me avec tracking et message pré-rempli.
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={sessions.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau lien
        </Button>
      </div>

      {sessions.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Aucune session WhatsApp connectée. Connectez une session pour créer des liens.
            </p>
          </CardContent>
        </Card>
      )}

      {links.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Link2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun lien</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez votre premier lien WhatsApp pour commencer le tracking.
            </p>
            {sessions.length > 0 && (
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Créer un lien
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {link.name}
                  </CardTitle>
                  <Badge variant={link.is_active ? 'default' : 'secondary'}>
                    {link.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {phone ? `+${phone}` : session?.instance_name || 'Session inconnue'}
                    </p>

                    {link.pre_filled_message && (
                      <p className="text-xs text-muted-foreground truncate">
                        Message : {link.pre_filled_message}
                      </p>
                    )}

                    {link.tracking_source && (
                      <p className="text-xs text-muted-foreground">
                        Source : {link.tracking_source}
                      </p>
                    )}

                    {link.ai_agent_id && (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs text-violet-600 border-violet-300">
                          <Bot className="mr-1 h-3 w-3" />
                          {agents.find((a) => a.id === link.ai_agent_id)?.name || 'Agent IA'}
                        </Badge>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MousePointerClick className="h-3 w-3" />
                      {link.click_count} clic{link.click_count !== 1 ? 's' : ''}
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
                      title="Copier le lien avec tracking"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Tracking
                    </Button>
                    {phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyDirectLink(link)}
                        className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
                        title="Copier le lien wa.me direct (pour Google My Business, etc.)"
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        wa.me
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(getPublicUrl(link.slug!), '_blank')}
                      disabled={!link.slug || !link.is_active}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Tester
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
                      onClick={() => handleDelete(link.id)}
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
            <DialogTitle>{editing ? 'Modifier le lien' : 'Nouveau lien WhatsApp'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifiez les paramètres de votre lien.'
                : 'Créez un lien wa.me avec un message pré-rempli et du tracking.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="link-name">Nom du lien *</Label>
              <Input
                id="link-name"
                placeholder="Ex: Campagne Facebook"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="link-session">Session WhatsApp *</Label>
                <Select value={formSessionId} onValueChange={setFormSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.phone_number ? `+${s.phone_number}` : s.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="link-message">Message pré-rempli</Label>
              <Textarea
                id="link-message"
                placeholder="Ex: Bonjour, je viens de votre site web !"
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-source">Source de tracking</Label>
              <Input
                id="link-source"
                placeholder="Ex: facebook, instagram, flyer"
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-slug">Slug personnalisé</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">/api/wa/</span>
                <Input
                  id="link-slug"
                  placeholder="auto-généré si vide"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-agent">Agent IA</Label>
              <Select value={formAgentId || 'none'} onValueChange={(val) => setFormAgentId(val === 'none' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun agent</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <Bot className="mr-1 inline h-3 w-3" />
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                L&apos;agent répondra automatiquement aux conversations initiées via ce lien.
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
              {editing ? 'Enregistrer' : 'Créer le lien'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
