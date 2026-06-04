'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WALink, WhatsAppSession, AIAgent } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { toast } from 'sonner'
import {
  Plus, Link2, Copy, Trash2, Pencil, Loader2,
  MousePointerClick, ExternalLink, Bot, QrCode, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import QRCode from 'qrcode'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { getCache, setCache } from '@/hooks/use-cached-fetch'

type LinkWithExtras = WALink & { session?: WhatsAppSession; agent?: AIAgent }

export function LinksSection() {
  const [links, setLinks] = useState<LinkWithExtras[]>(() => getCache<LinkWithExtras[]>('links') || [])
  const [sessions, setSessions] = useState<WhatsAppSession[]>(() => getCache<WhatsAppSession[]>('links:sessions') || [])
  const [agents, setAgents] = useState<AIAgent[]>(() => getCache<AIAgent[]>('links:agents') || [])
  const [loading, setLoading] = useState(() => !getCache('links'))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WALink | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})

  // Form state
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formSession, setFormSession] = useState('')
  const [formAgent, setFormAgent] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formActive, setFormActive] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [linksRes, sessionsRes, agentsRes] = await Promise.all([
        fetch('/api/links'),
        fetch('/api/sessions'),
        fetch('/api/agents'),
      ])
      const [linksJson, sessionsJson, agentsJson] = await Promise.all([
        linksRes.json(), sessionsRes.json(), agentsRes.json(),
      ])
      const sessionList: WhatsAppSession[] = sessionsJson.data || []
      const agentList: AIAgent[] = agentsJson.data || []
      const linkList: WALink[] = linksJson.data || []
      const linksWithExtras = linkList.map(l => ({
        ...l,
        session: sessionList.find(s => s.id === l.session_id),
        agent: agentList.find(a => a.id === l.ai_agent_id),
      }))
      setSessions(sessionList)
      setAgents(agentList)
      setLinks(linksWithExtras)
      setCache('links', linksWithExtras)
      setCache('links:sessions', sessionList)
      setCache('links:agents', agentList)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Générer QR codes
  useEffect(() => {
    links.forEach(async (link) => {
      if (qrUrls[link.id]) return
      const url = getLinkUrl(link)
      try {
        const qr = await QRCode.toDataURL(url, { width: 200, margin: 1 })
        setQrUrls(prev => ({ ...prev, [link.id]: qr }))
      } catch { /* ignore */ }
    })
  }, [links, qrUrls])

  function getLinkUrl(link: WALink) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return `${appUrl}/api/links/${link.slug}/redirect`
  }

  function getWaUrl(link: LinkWithExtras) {
    if (!link.session?.phone_number) return null
    const phone = link.session.phone_number.replace(/\D/g, '')
    const msg = encodeURIComponent(link.pre_filled_message || '')
    return `https://wa.me/${phone}${msg ? `?text=${msg}` : ''}`
  }

  function openCreate() {
    setEditing(null)
    setFormName(''); setFormSlug(''); setFormSession(''); setFormAgent('')
    setFormMessage(''); setFormActive(true)
    setDialogOpen(true)
  }

  function openEdit(link: WALink) {
    setEditing(link)
    setFormName(link.name); setFormSlug(link.slug || '')
    setFormSession(link.session_id || ''); setFormAgent(link.ai_agent_id || '')
    setFormMessage(link.pre_filled_message || ''); setFormActive(link.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formSession) return
    setSaving(true)
    try {
      const payload = {
        name: formName.trim(),
        slug: formSlug.trim() || undefined,
        session_id: formSession,
        agent_id: formAgent || null,
        welcome_message: formMessage.trim() || null,
        is_active: formActive,
      }
      const res = editing
        ? await fetch(`/api/links/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (res.ok) {
        toast.success(editing ? 'Portail mis à jour' : 'Portail créé')
        fetchAll()
        setDialogOpen(false)
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleToggle(link: WALink) {
    const res = await fetch(`/api/links/${link.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !link.is_active }),
    })
    if (res.ok) {
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l))
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const res = await fetch(`/api/links/${deleteId}`, { method: 'DELETE' })
    if (res.ok) {
      setLinks(prev => prev.filter(l => l.id !== deleteId))
      toast.success('Portail supprimé')
    }
    setDeleting(false); setDeleteId(null)
  }

  async function handleResetClicks(linkId: string) {
    await fetch(`/api/links/${linkId}/reset-clicks`, { method: 'POST' })
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, click_count: 0 } : l))
    toast.success('Compteur réinitialisé')
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast.success('Lien copié !')
  }

  function downloadQr(linkId: string, name: string) {
    const url = qrUrls[linkId]
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = `qr-${name}.png`; a.click()
  }

  if (loading) {
    return <BlobLoaderScreen />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Barre d'action de la section */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-sm text-muted-foreground">{links.length} portail{links.length !== 1 ? 's' : ''}</p>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau portail
        </Button>
      </div>

      {/* Grille */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {links.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Link2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Aucun portail encore</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">Créez un portail pour générer un lien WhatsApp avec QR code que vous pouvez partager.</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Créer mon premier portail
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map(link => (
              <PortailCard
                key={link.id}
                link={link}
                qrUrl={qrUrls[link.id]}
                linkUrl={getLinkUrl(link)}
                waUrl={getWaUrl(link)}
                onEdit={() => openEdit(link)}
                onToggle={() => handleToggle(link)}
                onDelete={() => setDeleteId(link.id)}
                onCopy={() => copyToClipboard(getLinkUrl(link))}
                onDownloadQr={() => downloadQr(link.id, link.slug || link.id)}
                onResetClicks={() => handleResetClicks(link.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le portail' : 'Nouveau portail'}</DialogTitle>
            <DialogDescription>Créez un lien WhatsApp avec QR code intégré.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom <span className="text-destructive">*</span></Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Lien vitrine" />
            </div>
            <div className="space-y-1.5">
              <Label>Session WhatsApp <span className="text-destructive">*</span></Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={formSession} onChange={e => setFormSession(e.target.value)}>
                <option value="">Choisir une session...</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Agent IA (optionnel)</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={formAgent} onChange={e => setFormAgent(e.target.value)}>
                <option value="">Sans agent</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Message d&apos;accueil (optionnel)</Label>
              <Textarea value={formMessage} onChange={e => setFormMessage(e.target.value)} placeholder="Bonjour, je suis intéressé par..." className="resize-none min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug personnalisé (optionnel)</Label>
              <Input value={formSlug} onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="mon-lien-perso" className="font-mono" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>Portail actif</Label>
            </div>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formSession} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? 'Mettre à jour' : 'Créer le portail'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={o => { if (!o) setDeleteId(null) }}
        onConfirm={handleDelete}
        title="Supprimer le portail"
        description="Ce portail et son QR code ne fonctionneront plus."
        loading={deleting}
      />
    </div>
  )
}

// ─── Card Portail ──────────────────────────────────────────────────────────────

function PortailCard({ link, qrUrl, linkUrl, waUrl, onEdit, onToggle, onDelete, onCopy, onDownloadQr, onResetClicks }: {
  link: LinkWithExtras
  qrUrl?: string
  linkUrl: string
  waUrl: string | null
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onCopy: () => void
  onDownloadQr: () => void
  onResetClicks: () => void
}) {
  return (
    <div className={cn('rounded-2xl border bg-card p-5 flex flex-col gap-4 hover:shadow-md transition-all', !link.is_active && 'opacity-60')}>
      {/* QR Code + nom */}
      <div className="flex items-start gap-4">
        {qrUrl ? (
          <img src={qrUrl} alt="QR" className="h-20 w-20 rounded-xl border flex-shrink-0" />
        ) : (
          <div className="h-20 w-20 flex-shrink-0 flex items-center justify-center rounded-xl bg-muted border">
            <QrCode className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{link.name}</p>
          <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">/{link.slug}</p>
          {link.agent && (
            <span className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
              <Bot className="h-2.5 w-2.5" />{link.agent.name}
            </span>
          )}
          {link.session && (
            <p className="text-[10px] text-muted-foreground mt-0.5">📱 {link.session.phone_number}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs">
          <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">{link.click_count ?? 0}</span>
          <span className="text-muted-foreground">clics</span>
        </div>
        <div className={cn('ml-auto flex items-center gap-1.5 text-[11px] font-medium', link.is_active ? 'text-emerald-500' : 'text-muted-foreground')}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {link.is_active ? 'Actif' : 'Inactif'}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCopy}>
          <Copy className="mr-1.5 h-3 w-3" /> Copier lien
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onDownloadQr} disabled={!qrUrl}>
          <QrCode className="mr-1.5 h-3 w-3" /> QR Code
        </Button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" className="col-span-2">
            <Button size="sm" variant="secondary" className="h-8 text-xs w-full">
              <ExternalLink className="mr-1.5 h-3 w-3" /> Ouvrir WhatsApp
            </Button>
          </a>
        )}
      </div>

      {/* Actions secondaires */}
      <div className="flex gap-1 border-t pt-2">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
          <Pencil className="mr-1 h-3 w-3" /> Modifier
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onToggle}>
          {link.is_active ? 'Désactiver' : 'Activer'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onResetClicks} title="Remettre le compteur à 0">
          <RotateCcw className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive ml-auto" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
