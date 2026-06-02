'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { KnowledgeDocument, AIAgent } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import {
  Plus, FileText, Upload, Trash2, Loader2, BookOpen,
  RefreshCw, Bot, Eye, Image as ImageIcon, Tag, Search,
  File, CheckCircle, XCircle, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoader } from '@/components/blob-loader'
import { getCache, setCache } from '@/hooks/use-cached-fetch'

type DocWithTeamIds = KnowledgeDocument & { team_ids?: string[] }
type KnowledgeImage = {
  id: string; ref: string; filename: string; mime_type: string
  storage_path: string; agent_id: string | null; created_at: string
}
type LibraryItem =
  | { kind: 'doc'; data: DocWithTeamIds }
  | { kind: 'image'; data: KnowledgeImage }

const STATUS_CONFIG = {
  ready: { label: 'Prêt', icon: CheckCircle, color: 'text-emerald-500' },
  processing: { label: 'En cours d\'analyse...', icon: Loader2, color: 'text-blue-500' },
  pending: { label: 'En attente...', icon: Clock, color: 'text-yellow-500' },
  error: { label: 'Erreur', icon: XCircle, color: 'text-destructive' },
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<DocWithTeamIds[]>(() => getCache<DocWithTeamIds[]>('kb:docs') || [])
  const [images, setImages] = useState<KnowledgeImage[]>(() => getCache<KnowledgeImage[]>('kb:images') || [])
  const [agents, setAgents] = useState<AIAgent[]>(() => getCache<AIAgent[]>('kb:agents') || [])
  const [loading, setLoading] = useState(() => !getCache('kb:docs'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'docs' | 'images'>('all')

  // Dialog état doc
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [docName, setDocName] = useState('')
  const [docDescription, setDocDescription] = useState('')
  const [docText, setDocText] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docTab, setDocTab] = useState<'text' | 'file'>('text')
  const [docSaving, setDocSaving] = useState(false)
  const docFileRef = useRef<HTMLInputElement>(null)

  // Dialog état image
  const [imgDialogOpen, setImgDialogOpen] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgRef, setImgRef] = useState('')
  const [imgAgentId, setImgAgentId] = useState('')
  const [imgSaving, setImgSaving] = useState(false)
  const [imgPreviewUrls, setImgPreviewUrls] = useState<Record<string, string>>({})
  const [imgEditingAgent, setImgEditingAgent] = useState<string | null>(null)
  const [imgAgentSaving, setImgAgentSaving] = useState<string | null>(null)
  const imgFileRef = useRef<HTMLInputElement>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'doc' | 'image'; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Assign agents dialog
  const [assignDocId, setAssignDocId] = useState<string | null>(null)
  const [assignAgentIds, setAssignAgentIds] = useState<string[]>([])
  const [assignSaving, setAssignSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [docsRes, imgsRes, agentsRes] = await Promise.all([
        fetch('/api/knowledge'),
        fetch('/api/knowledge-images'),
        fetch('/api/agents'),
      ])
      const [docsJson, imgsJson, agentsJson] = await Promise.all([
        docsRes.json(), imgsRes.json(), agentsRes.json(),
      ])
      const docs = docsJson.data || []
      const imgs = imgsJson.data || []
      const ags = agentsJson.data || []
      setDocuments(docs)
      setImages(imgs)
      setAgents(ags)
      setCache('kb:docs', docs)
      setCache('kb:images', imgs)
      setCache('kb:agents', ags)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Polling docs en processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing' || d.status === 'pending')
    if (!hasProcessing) return
    const t = setInterval(async () => {
      const res = await fetch('/api/knowledge')
      const json = await res.json()
      if (res.ok) setDocuments(json.data || [])
    }, 5000)
    return () => clearInterval(t)
  }, [documents])

  // Items fusionnés + filtrage
  const allItems: LibraryItem[] = [
    ...documents.map(d => ({ kind: 'doc' as const, data: d })),
    ...images.map(i => ({ kind: 'image' as const, data: i })),
  ].filter(item => {
    if (filter === 'docs' && item.kind !== 'doc') return false
    if (filter === 'images' && item.kind !== 'image') return false
    const name = item.kind === 'doc' ? item.data.name : item.data.filename
    return search === '' || name.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => {
    const aDate = a.kind === 'doc' ? a.data.created_at : a.data.created_at
    const bDate = b.kind === 'doc' ? b.data.created_at : b.data.created_at
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })

  // ─── Handlers docs ────────────────────────────────────────────────────────

  async function handleSaveDoc() {
    if (!docName.trim()) return
    setDocSaving(true)
    try {
      let body: FormData | string
      let headers: Record<string, string> = {}
      if (docTab === 'file' && docFile) {
        const form = new FormData()
        form.append('name', docName.trim())
        form.append('description', docDescription.trim())
        form.append('file', docFile)
        body = form
      } else {
        body = JSON.stringify({ name: docName.trim(), description: docDescription.trim(), content: docText.trim() })
        headers = { 'Content-Type': 'application/json' }
      }
      const res = await fetch('/api/knowledge', { method: 'POST', headers, body })
      const json = await res.json()
      if (res.ok && json.data) {
        setDocuments(prev => [json.data, ...prev])
        toast.success('Document ajouté')
        setDocDialogOpen(false)
        setDocName(''); setDocDescription(''); setDocText(''); setDocFile(null)
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setDocSaving(false) }
  }

  async function handleReprocess(docId: string) {
    await fetch(`/api/knowledge/${docId}/reprocess`, { method: 'POST' })
    fetchAll()
    toast.success('Retraitement lancé')
  }

  // ─── Handlers images ──────────────────────────────────────────────────────

  async function loadImgPreview(img: KnowledgeImage): Promise<string | null> {
    if (imgPreviewUrls[img.id]) return imgPreviewUrls[img.id]
    try {
      const res = await fetch(`/api/knowledge-images/${img.id}`)
      const json = await res.json()
      if (res.ok && json.url) {
        setImgPreviewUrls(prev => ({ ...prev, [img.id]: json.url }))
        return json.url
      }
    } catch { /* ignore */ }
    return null
  }

  async function handleSaveImg() {
    if (!imgFile || !imgRef.trim()) return
    setImgSaving(true)
    try {
      const form = new FormData()
      form.append('file', imgFile)
      form.append('ref', imgRef.trim())
      if (imgAgentId) form.append('agent_id', imgAgentId)
      const res = await fetch('/api/knowledge-images', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok && json.data) {
        setImages(prev => [json.data, ...prev.filter(i => i.id !== json.data.id)])
        toast.success('Image ajoutée')
        setImgDialogOpen(false); setImgFile(null); setImgRef(''); setImgAgentId('')
      } else { toast.error(json.error || 'Erreur upload') }
    } catch { toast.error('Erreur réseau') }
    finally { setImgSaving(false) }
  }

  async function handleUpdateImgAgent(id: string, agentId: string | null) {
    setImgAgentSaving(id)
    try {
      const res = await fetch('/api/knowledge-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, agent_id: agentId }),
      })
      const json = await res.json()
      if (res.ok) {
        setImages(prev => prev.map(i => i.id === id ? { ...i, agent_id: agentId } : i))
        setImgEditingAgent(null)
        toast.success('Agent mis à jour')
      } else { toast.error(json.error || 'Erreur') }
    } catch { toast.error('Erreur réseau') }
    finally { setImgAgentSaving(null) }
  }

  // ─── Assign agents ────────────────────────────────────────────────────────

  function openAssign(doc: DocWithTeamIds) {
    setAssignDocId(doc.id)
    setAssignAgentIds(doc.team_ids || [])
  }

  async function handleSaveAssign() {
    if (!assignDocId) return
    setAssignSaving(true)
    try {
      const res = await fetch(`/api/knowledge/${assignDocId}/agents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_ids: assignAgentIds }),
      })
      if (res.ok) {
        setDocuments(prev => prev.map(d => d.id === assignDocId ? { ...d, team_ids: assignAgentIds } : d))
        toast.success('Agents mis à jour')
        setAssignDocId(null)
      }
    } catch { toast.error('Erreur réseau') }
    finally { setAssignSaving(false) }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const url = deleteTarget.kind === 'doc'
        ? `/api/knowledge/${deleteTarget.id}`
        : `/api/knowledge-images?id=${deleteTarget.id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) {
        if (deleteTarget.kind === 'doc') setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id))
        else setImages(prev => prev.filter(i => i.id !== deleteTarget.id))
        toast.success('Supprimé')
      }
    } catch { toast.error('Erreur') }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Bibliothèque
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {documents.length} document{documents.length !== 1 ? 's' : ''} · {images.length} image{images.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImgDialogOpen(true)}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Image IA
          </Button>
          <Button size="sm" onClick={() => setDocDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Document
          </Button>
        </div>
      </div>

      {/* Filtres & recherche */}
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'docs', 'images'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {f === 'all' ? 'Tout' : f === 'docs' ? '📄 Documents' : '🖼️ Images IA'}
            </button>
          ))}
        </div>
      </div>

      {/* Grille */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <BlobLoader size={88} />
          </div>
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Bibliothèque vide</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Ajoutez des documents ou des images pour enrichir vos agents IA.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allItems.map(item => item.kind === 'doc' ? (
              <DocCard
                key={item.data.id}
                doc={item.data}
                agents={agents}
                onReprocess={() => handleReprocess(item.data.id)}
                onAssign={() => openAssign(item.data)}
                onDelete={() => setDeleteTarget({ kind: 'doc', id: item.data.id, name: item.data.name })}
              />
            ) : (
              <ImageCard
                key={item.data.id}
                img={item.data}
                agents={agents}
                previewUrl={imgPreviewUrls[item.data.id]}
                editingAgent={imgEditingAgent === item.data.id}
                agentSaving={imgAgentSaving === item.data.id}
                onLoadPreview={() => loadImgPreview(item.data)}
                onOpenFull={async () => {
                  const url = await loadImgPreview(item.data)
                  if (url) window.open(url, '_blank')
                }}
                onEditAgent={() => setImgEditingAgent(item.data.id)}
                onUpdateAgent={(agentId) => handleUpdateImgAgent(item.data.id, agentId)}
                onCancelEditAgent={() => setImgEditingAgent(null)}
                onDelete={() => setDeleteTarget({ kind: 'image', id: item.data.id, name: item.data.filename })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog nouveau document */}
      <Dialog open={docDialogOpen} onOpenChange={o => { setDocDialogOpen(o); if (!o) { setDocName(''); setDocDescription(''); setDocText(''); setDocFile(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un document</DialogTitle>
            <DialogDescription>Texte ou fichier (PDF, Word, TXT…)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom <span className="text-destructive">*</span></Label>
              <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Ex: FAQ produits" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optionnel)</Label>
              <Input value={docDescription} onChange={e => setDocDescription(e.target.value)} placeholder="Brève description..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDocTab('text')} className={cn('flex-1 rounded-lg border py-2 text-sm font-medium transition-colors', docTab === 'text' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                ✏️ Texte
              </button>
              <button onClick={() => setDocTab('file')} className={cn('flex-1 rounded-lg border py-2 text-sm font-medium transition-colors', docTab === 'file' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                📎 Fichier
              </button>
            </div>
            {docTab === 'text' ? (
              <Textarea value={docText} onChange={e => setDocText(e.target.value)} placeholder="Collez votre contenu ici..." className="min-h-[120px]" />
            ) : (
              <div>
                <Input ref={docFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv" onChange={e => setDocFile(e.target.files?.[0] || null)} />
                {docFile && <p className="text-xs text-muted-foreground mt-1">{docFile.name}</p>}
              </div>
            )}
            <Button onClick={handleSaveDoc} disabled={docSaving || !docName.trim()} className="w-full">
              {docSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Ajouter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nouvelle image */}
      <Dialog open={imgDialogOpen} onOpenChange={o => { setImgDialogOpen(o); if (!o) { setImgFile(null); setImgRef(''); setImgAgentId('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une image IA</DialogTitle>
            <DialogDescription>L&apos;agent pourra envoyer cette image via <code className="bg-muted px-1 rounded text-xs">[IMAGE:ref]</code></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Référence <span className="text-destructive">*</span></Label>
              <Input value={imgRef} onChange={e => setImgRef(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="ex: menu-burger" />
              <p className="text-[10px] text-muted-foreground">Lettres, chiffres, tirets uniquement.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Image <span className="text-destructive">*</span></Label>
              <Input ref={imgFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setImgFile(e.target.files?.[0] || null)} />
            </div>
            {imgFile && <img src={URL.createObjectURL(imgFile)} alt="preview" className="h-32 w-full rounded-lg object-cover border" />}
            <div className="space-y-1.5">
              <Label>Agent associé (optionnel)</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={imgAgentId} onChange={e => setImgAgentId(e.target.value)}>
                <option value="">Tous les agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Button onClick={handleSaveImg} disabled={imgSaving || !imgFile || !imgRef.trim()} className="w-full">
              {imgSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Uploader
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog assign agents */}
      <Dialog open={!!assignDocId} onOpenChange={o => { if (!o) setAssignDocId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Agents liés</DialogTitle>
            <DialogDescription>Choisissez les agents qui peuvent utiliser ce document</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {agents.map(a => (
              <label key={a.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignAgentIds.includes(a.id)}
                  onChange={e => setAssignAgentIds(prev => e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id))}
                  className="rounded"
                />
                <span className="text-sm">{a.name}</span>
              </label>
            ))}
            <Button onClick={handleSaveAssign} disabled={assignSaving} className="w-full mt-2">
              {assignSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
        onConfirm={handleDelete}
        title="Supprimer"
        description={`Supprimer "${deleteTarget?.name}" ? Cette action est irréversible.`}
        loading={deleting}
      />
    </div>
  )
}

// ─── Card Document ─────────────────────────────────────────────────────────────

function DocCard({ doc, agents, onReprocess, onAssign, onDelete }: {
  doc: DocWithTeamIds
  agents: AIAgent[]
  onReprocess: () => void
  onAssign: () => void
  onDelete: () => void
}) {
  const status = STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ready
  const StatusIcon = status.icon
  const isProcessing = doc.status === 'processing' || doc.status === 'pending'
  const linkedAgents = agents.filter(a => doc.team_ids?.includes(a.id))

  return (
    <div className="group rounded-2xl border bg-card p-4 flex flex-col gap-3 hover:shadow-md hover:border-primary/30 transition-all">
      {/* Icon + nom */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
          <FileText className="h-5 w-5 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{doc.name}</p>
          {doc.description && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{doc.description}</p>}
        </div>
      </div>

      {/* Statut */}
      <div className={cn('flex items-center gap-1.5 text-[11px] font-medium', status.color)}>
        <StatusIcon className={cn('h-3 w-3', isProcessing && 'animate-spin')} />
        {status.label}
        {doc.status === 'ready' && doc.chunk_count && (
          <span className="text-muted-foreground font-normal">· {doc.chunk_count} extraits</span>
        )}
      </div>

      {/* Agents liés */}
      {linkedAgents.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {linkedAgents.slice(0, 2).map(a => (
            <span key={a.id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              <Bot className="h-2.5 w-2.5" />{a.name}
            </span>
          ))}
          {linkedAgents.length > 2 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">+{linkedAgents.length - 2}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 mt-auto pt-1">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs flex-1" onClick={onAssign}>
          <Bot className="mr-1 h-3 w-3" />
          Agents
        </Button>
        {doc.status === 'error' && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onReprocess}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── Card Image ────────────────────────────────────────────────────────────────

function ImageCard({ img, agents, previewUrl, editingAgent, agentSaving, onLoadPreview, onOpenFull, onEditAgent, onUpdateAgent, onCancelEditAgent, onDelete }: {
  img: KnowledgeImage
  agents: AIAgent[]
  previewUrl?: string
  editingAgent: boolean
  agentSaving: boolean
  onLoadPreview: () => void
  onOpenFull: () => void
  onEditAgent: () => void
  onUpdateAgent: (agentId: string | null) => void
  onCancelEditAgent: () => void
  onDelete: () => void
}) {
  const linkedAgent = agents.find(a => a.id === img.agent_id)
  const [errored, setErrored] = useState(false)

  // Charge la miniature automatiquement au montage (et si l'image change)
  useEffect(() => {
    if (!previewUrl) onLoadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img.id])

  return (
    <div className="group rounded-2xl border bg-card overflow-hidden hover:shadow-md hover:border-primary/30 transition-all">
      {/* Preview */}
      <div className="relative h-32 bg-muted cursor-pointer" onClick={onOpenFull}>
        {previewUrl && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={img.ref} className="h-full w-full object-cover" onError={() => setErrored(true)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            {previewUrl ? (
              <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
            )}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
          <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Ref */}
        <div className="flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-muted-foreground" />
          <code className="text-xs font-mono font-medium truncate">{img.ref}</code>
        </div>

        {/* Agent associé */}
        {editingAgent ? (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 rounded border bg-background px-2 py-1 text-[11px]"
              defaultValue={img.agent_id || ''}
              autoFocus
              onChange={e => onUpdateAgent(e.target.value || null)}
              onBlur={onCancelEditAgent}
              disabled={agentSaving}
            >
              <option value="">Tous les agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {agentSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors text-left"
            onClick={onEditAgent}
          >
            <Bot className="h-3 w-3 shrink-0" />
            <span className="truncate">{linkedAgent ? linkedAgent.name : 'Tous les agents'}</span>
            <span className="ml-auto text-[10px] opacity-50">modifier</span>
          </button>
        )}

        {/* Supprimer */}
        <Button size="sm" variant="ghost" className="h-7 w-full text-xs text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3 w-3" /> Supprimer
        </Button>
      </div>
    </div>
  )
}
