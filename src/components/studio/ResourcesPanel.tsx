'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { KnowledgeDocument, AIAgent, WALink, WhatsAppSession } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  BookOpen, Link2, Plus, FileText, Loader2, Upload, Trash2,
  Image as ImageIcon, Tag, Eye, CheckCircle, XCircle, Clock, QrCode, Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import QRCode from 'qrcode'

type DocWithTeamIds = KnowledgeDocument & { team_ids?: string[] }
type KnowledgeImage = {
  id: string; ref: string; filename: string; mime_type: string
  storage_path: string; agent_id: string | null; created_at: string
}
type WALinkExtended = WALink & { session?: WhatsAppSession; agent?: AIAgent }

const STATUS_ICON = {
  ready: <CheckCircle className="h-3 w-3 text-emerald-500" />,
  processing: <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />,
  pending: <Clock className="h-3 w-3 text-yellow-500" />,
  error: <XCircle className="h-3 w-3 text-destructive" />,
}

interface ResourcesPanelProps {
  agentId: string | null
}

export function ResourcesPanel({ agentId }: ResourcesPanelProps) {
  const [tab, setTab] = useState<'biblio' | 'portails'>('biblio')
  const [docs, setDocs] = useState<DocWithTeamIds[]>([])
  const [images, setImages] = useState<KnowledgeImage[]>([])
  const [links, setLinks] = useState<WALinkExtended[]>([])
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [imgPreviewUrls, setImgPreviewUrls] = useState<Record<string, string>>({})
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})

  // Dialogs
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [imgDialogOpen, setImgDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  // Doc form
  const [docName, setDocName] = useState('')
  const [docText, setDocText] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docTab, setDocTab] = useState<'text' | 'file'>('text')
  const [docSaving, setDocSaving] = useState(false)
  const docFileRef = useRef<HTMLInputElement>(null)

  // Image form
  const [imgRef, setImgRef] = useState('')
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgSaving, setImgSaving] = useState(false)

  // Link form
  const [linkName, setLinkName] = useState('')
  const [linkSession, setLinkSession] = useState('')
  const [linkAgent, setLinkAgent] = useState('')
  const [linkMessage, setLinkMessage] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, imgsRes, linksRes, sessionsRes, agentsRes] = await Promise.all([
        fetch('/api/knowledge'),
        fetch('/api/knowledge-images'),
        fetch('/api/links'),
        fetch('/api/sessions'),
        fetch('/api/agents'),
      ])
      const [docsJson, imgsJson, linksJson, sessionsJson, agentsJson] = await Promise.all([
        docsRes.json(), imgsRes.json(), linksRes.json(), sessionsRes.json(), agentsRes.json(),
      ])
      const sessionList: WhatsAppSession[] = sessionsJson.data || []
      const agentList: AIAgent[] = agentsJson.data || []
      setDocs(docsJson.data || [])
      setImages(imgsJson.data || [])
      setSessions(sessionList)
      setAgents(agentList)
      setLinks((linksJson.data || []).map((l: WALink) => ({
        ...l,
        session: sessionList.find(s => s.id === l.session_id),
        agent: agentList.find(a => a.id === l.ai_agent_id),
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Générer QR codes pour les liens
  useEffect(() => {
    links.forEach(async link => {
      if (qrUrls[link.id]) return
      try {
        const url = `${window.location.origin}/api/links/${link.slug}/redirect`
        const qr = await QRCode.toDataURL(url, { width: 120, margin: 1 })
        setQrUrls(prev => ({ ...prev, [link.id]: qr }))
      } catch { /* ignore */ }
    })
  }, [links, qrUrls])

  async function loadImgPreview(img: KnowledgeImage) {
    if (imgPreviewUrls[img.id]) { window.open(imgPreviewUrls[img.id], '_blank'); return }
    const res = await fetch(`/api/knowledge-images/${img.id}`)
    const json = await res.json()
    if (res.ok && json.url) {
      setImgPreviewUrls(prev => ({ ...prev, [img.id]: json.url }))
      window.open(json.url, '_blank')
    }
  }

  async function handleSaveDoc() {
    if (!docName.trim()) return
    setDocSaving(true)
    try {
      let body: FormData | string; let headers: Record<string, string> = {}
      if (docTab === 'file' && docFile) {
        const form = new FormData()
        form.append('name', docName.trim()); form.append('file', docFile)
        body = form
      } else {
        body = JSON.stringify({ name: docName.trim(), content: docText.trim() })
        headers = { 'Content-Type': 'application/json' }
      }
      const res = await fetch('/api/knowledge', { method: 'POST', headers, body })
      const json = await res.json()
      if (res.ok) {
        setDocs(prev => [json.data, ...prev])
        toast.success('Document ajouté')
        setDocDialogOpen(false); setDocName(''); setDocText(''); setDocFile(null)
      } else toast.error(json.error || 'Erreur')
    } catch { toast.error('Erreur réseau') }
    finally { setDocSaving(false) }
  }

  async function handleDeleteDoc(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
    toast.success('Document supprimé')
  }

  async function handleSaveImg() {
    if (!imgFile || !imgRef.trim()) return
    setImgSaving(true)
    try {
      const form = new FormData()
      form.append('file', imgFile); form.append('ref', imgRef.trim())
      if (agentId) form.append('agent_id', agentId)
      const res = await fetch('/api/knowledge-images', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok) {
        setImages(prev => [json.data, ...prev])
        toast.success('Image ajoutée')
        setImgDialogOpen(false); setImgFile(null); setImgRef('')
      } else toast.error(json.error || 'Erreur')
    } catch { toast.error('Erreur réseau') }
    finally { setImgSaving(false) }
  }

  async function handleDeleteImg(id: string) {
    await fetch(`/api/knowledge-images?id=${id}`, { method: 'DELETE' })
    setImages(prev => prev.filter(i => i.id !== id))
    toast.success('Image supprimée')
  }

  async function handleSaveLink() {
    if (!linkName.trim() || !linkSession) return
    setLinkSaving(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: linkName.trim(),
          session_id: linkSession,
          ai_agent_id: linkAgent || null,
          pre_filled_message: linkMessage.trim() || null,
          is_active: true,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        fetchAll()
        toast.success('Portail créé')
        setLinkDialogOpen(false); setLinkName(''); setLinkSession(''); setLinkAgent(''); setLinkMessage('')
      } else toast.error(json.error || 'Erreur')
    } catch { toast.error('Erreur réseau') }
    finally { setLinkSaving(false) }
  }

  async function handleDeleteLink(id: string) {
    await fetch(`/api/links/${id}`, { method: 'DELETE' })
    setLinks(prev => prev.filter(l => l.id !== id))
    toast.success('Portail supprimé')
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col h-full bg-muted/20">
      {/* Tabs header */}
      <div className="border-b">
        <div className="flex">
          <button
            onClick={() => setTab('biblio')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              tab === 'biblio' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <BookOpen className="h-3.5 w-3.5" /> Bibliothèque
          </button>
          <button
            onClick={() => setTab('portails')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              tab === 'portails' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Link2 className="h-3.5 w-3.5" /> Portails
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* ─── Bibliothèque ─── */}
          {tab === 'biblio' && (
            <div className="p-2 space-y-4">
              {/* Documents */}
              <div>
                <div className="flex items-center justify-between px-1 py-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Documents</p>
                  <button onClick={() => setDocDialogOpen(true)} className="rounded p-0.5 hover:bg-muted transition-colors">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                {docs.length === 0 ? (
                  <button onClick={() => setDocDialogOpen(true)} className="w-full rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                    + Ajouter un document
                  </button>
                ) : (
                  <div className="space-y-1">
                    {docs.map(doc => (
                      <div key={doc.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate">{doc.name}</p>
                          <div className="flex items-center gap-1">
                            {STATUS_ICON[doc.status as keyof typeof STATUS_ICON]}
                            {doc.chunk_count ? <span className="text-[9px] text-muted-foreground">{doc.chunk_count} extraits</span> : null}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images IA */}
              <div>
                <div className="flex items-center justify-between px-1 py-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Images IA</p>
                  <button onClick={() => setImgDialogOpen(true)} className="rounded p-0.5 hover:bg-muted transition-colors">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                {images.length === 0 ? (
                  <button onClick={() => setImgDialogOpen(true)} className="w-full rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                    + Ajouter une image
                  </button>
                ) : (
                  <div className="space-y-1">
                    {images.map(img => (
                      <div key={img.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                            <code className="text-[10px] font-mono truncate">{img.ref}</code>
                          </div>
                          <p className="text-[9px] text-muted-foreground truncate">{img.filename}</p>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => loadImgPreview(img)}>
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleDeleteImg(img.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Portails ─── */}
          {tab === 'portails' && (
            <div className="p-2">
              <div className="flex items-center justify-between px-1 py-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Liens WhatsApp</p>
                <button onClick={() => setLinkDialogOpen(true)} className="rounded p-0.5 hover:bg-muted transition-colors">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              {links.length === 0 ? (
                <button onClick={() => setLinkDialogOpen(true)} className="w-full rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                  + Créer un portail
                </button>
              ) : (
                <div className="space-y-2">
                  {links.map(link => (
                    <div key={link.id} className="group rounded-xl border bg-card p-2.5 space-y-2">
                      <div className="flex items-start gap-2">
                        {qrUrls[link.id] ? (
                          <img src={qrUrls[link.id]} alt="QR" className="h-10 w-10 rounded border flex-shrink-0" />
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded border bg-muted">
                            <QrCode className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{link.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">/{link.slug}</p>
                          <div className={cn('flex items-center gap-1 mt-0.5 text-[9px]', link.is_active ? 'text-emerald-500' : 'text-muted-foreground')}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {link.is_active ? 'Actif' : 'Inactif'} · {link.click_count ?? 0} clics
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/links/${link.slug}/redirect`); toast.success('Copié !') }}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-muted py-1 text-[10px] hover:bg-muted/80 transition-colors"
                        >
                          <Copy className="h-3 w-3" /> Copier
                        </button>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dialog doc */}
      <Dialog open={docDialogOpen} onOpenChange={o => { setDocDialogOpen(o); if (!o) { setDocName(''); setDocText(''); setDocFile(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un document</DialogTitle>
            <DialogDescription>Texte ou fichier pour enrichir vos agents IA</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom <span className="text-destructive">*</span></Label>
              <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Ex: FAQ produits" className="h-8" />
            </div>
            <div className="flex gap-2">
              {(['text', 'file'] as const).map(t => (
                <button key={t} onClick={() => setDocTab(t)} className={cn('flex-1 rounded-lg border py-2 text-xs font-medium transition-colors', docTab === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {t === 'text' ? '✏️ Texte' : '📎 Fichier'}
                </button>
              ))}
            </div>
            {docTab === 'text'
              ? <Textarea value={docText} onChange={e => setDocText(e.target.value)} placeholder="Collez votre contenu..." className="min-h-[100px] text-sm" />
              : <Input ref={docFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={e => setDocFile(e.target.files?.[0] || null)} />
            }
            <Button onClick={handleSaveDoc} disabled={docSaving || !docName.trim()} className="w-full">
              {docSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Ajouter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog image */}
      <Dialog open={imgDialogOpen} onOpenChange={o => { setImgDialogOpen(o); if (!o) { setImgFile(null); setImgRef('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Image IA</DialogTitle>
            <DialogDescription>Référencée par <code className="bg-muted px-1 rounded text-xs">[IMAGE:ref]</code></DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Référence <span className="text-destructive">*</span></Label>
              <Input value={imgRef} onChange={e => setImgRef(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="ex: menu-burger" className="h-8 font-mono" />
            </div>
            <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setImgFile(e.target.files?.[0] || null)} />
            {imgFile && <img src={URL.createObjectURL(imgFile)} alt="preview" className="h-24 w-full rounded-lg object-cover border" />}
            <Button onClick={handleSaveImg} disabled={imgSaving || !imgFile || !imgRef.trim()} className="w-full">
              {imgSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Uploader
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog lien */}
      <Dialog open={linkDialogOpen} onOpenChange={o => { setLinkDialogOpen(o); if (!o) { setLinkName(''); setLinkSession(''); setLinkAgent(''); setLinkMessage('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau portail</DialogTitle>
            <DialogDescription>Lien WhatsApp avec QR code</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom <span className="text-destructive">*</span></Label>
              <Input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Ex: Lien vitrine" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Session WhatsApp <span className="text-destructive">*</span></Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-xs" value={linkSession} onChange={e => setLinkSession(e.target.value)}>
                <option value="">Choisir...</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Agent IA (optionnel)</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-xs" value={linkAgent} onChange={e => setLinkAgent(e.target.value)}>
                <option value="">Sans agent</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message d&apos;accueil (optionnel)</Label>
              <Textarea value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="Bonjour, je suis intéressé..." className="resize-none min-h-[60px] text-sm" />
            </div>
            <Button onClick={handleSaveLink} disabled={linkSaving || !linkName.trim() || !linkSession} className="w-full">
              {linkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Créer le portail
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
