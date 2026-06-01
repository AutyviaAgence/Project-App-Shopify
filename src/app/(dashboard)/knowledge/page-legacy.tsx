'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { KnowledgeDocument, AIAgent, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Plus,
  FileText,
  Upload,
  Trash2,
  Pencil,
  Loader2,
  BookOpen,
  RefreshCw,
  Bot,
  Check,
  Download,
  Eye,
  Users,
  Image as ImageIcon,
  Tag,
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { MultiTeamSelect } from '@/components/multi-team-select'
import { useTranslation } from '@/i18n/context'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }
type DocWithTeamIds = KnowledgeDocument & { team_ids?: string[] }

type KnowledgeImage = {
  id: string
  ref: string
  filename: string
  mime_type: string
  storage_path: string
  agent_id: string | null
  created_at: string
}

export default function KnowledgePage() {
  const { t } = useTranslation()
  const [pageTab, setPageTab] = useState<'documents' | 'images'>('documents')
  const [documents, setDocuments] = useState<DocWithTeamIds[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Images state
  const [images, setImages] = useState<KnowledgeImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageRef, setImageRef] = useState('')
  const [imageAgentId, setImageAgentId] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({})
  const [imageEditingAgentId, setImageEditingAgentId] = useState<string | null>(null)
  const [imageAgentSaving, setImageAgentSaving] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DocWithTeamIds | null>(null)
  const [formTab, setFormTab] = useState<string>('text')
  const [formTeamIds, setFormTeamIds] = useState<string[]>([])
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTextContent, setFormTextContent] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Agent association dialog
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null)
  const [docAgentIds, setDocAgentIds] = useState<string[]>([])
  const [savingAgents, setSavingAgents] = useState(false)

  // View document dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewDoc, setViewDoc] = useState<{ name: string; content: string } | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState<KnowledgeDocument | null>(null)

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function statusBadge(status: string) {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-600 text-white">{t('knowledge.ready')}</Badge>
      case 'processing':
        return (
          <Badge className="bg-blue-600 text-white">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {t('knowledge.processing')}
          </Badge>
        )
      case 'pending':
        return <Badge variant="secondary">{t('knowledge.pending')}</Badge>
      case 'error':
        return <Badge variant="destructive">{t('knowledge.error')}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  function typeBadge(docType: string) {
    return docType === 'pdf' ? (
      <Badge variant="outline" className="text-xs">
        <Upload className="mr-1 h-3 w-3" />
        {t('knowledge.pdf')}
      </Badge>
    ) : (
      <Badge variant="outline" className="text-xs">
        <FileText className="mr-1 h-3 w-3" />
        {t('knowledge.text')}
      </Badge>
    )
  }

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge')
      const json = await res.json()
      if (res.ok && json.data) {
        setDocuments(json.data)
      }
    } catch {
      toast.error(t('knowledge.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data)
      }
    } catch {
      // silently fail
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

  const fetchImages = useCallback(async () => {
    setImagesLoading(true)
    try {
      const res = await fetch('/api/knowledge-images')
      const json = await res.json()
      if (res.ok && json.data) setImages(json.data)
    } catch { /* ignore */ } finally {
      setImagesLoading(false)
    }
  }, [])

  async function loadImagePreview(img: KnowledgeImage): Promise<string | null> {
    if (imagePreviewUrls[img.id]) return imagePreviewUrls[img.id]
    try {
      const res = await fetch(`/api/knowledge-images/${img.id}`)
      const json = await res.json()
      if (res.ok && json.url) {
        setImagePreviewUrls(prev => ({ ...prev, [img.id]: json.url }))
        return json.url as string
      }
    } catch { /* ignore */ }
    return null
  }

  async function handleImageUpload() {
    if (!imageFile || !imageRef.trim()) {
      toast.error('Fichier et référence requis')
      return
    }
    setImageSaving(true)
    try {
      const form = new FormData()
      form.append('file', imageFile)
      form.append('ref', imageRef.trim())
      if (imageAgentId) form.append('agent_id', imageAgentId)
      const res = await fetch('/api/knowledge-images', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok && json.data) {
        setImages(prev => [json.data, ...prev.filter(i => i.id !== json.data.id)])
        toast.success('Image ajoutée')
        setImageDialogOpen(false)
        setImageFile(null)
        setImageRef('')
        setImageAgentId('')
        if (imageInputRef.current) imageInputRef.current.value = ''
      } else {
        toast.error(json.error || 'Erreur upload')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setImageSaving(false)
    }
  }

  async function handleDeleteImage(id: string) {
    try {
      const res = await fetch(`/api/knowledge-images?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setImages(prev => prev.filter(i => i.id !== id))
        setImagePreviewUrls(prev => { const n = { ...prev }; delete n[id]; return n })
        toast.success('Image supprimée')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur suppression')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  async function handleUpdateImageAgent(id: string, agentId: string | null) {
    setImageAgentSaving(id)
    try {
      const res = await fetch('/api/knowledge-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, agent_id: agentId }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setImages(prev => prev.map(i => i.id === id ? { ...i, agent_id: agentId } : i))
        setImageEditingAgentId(null)
        toast.success('Agent mis à jour')
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setImageAgentSaving(null)
    }
  }

  useEffect(() => {
    fetchDocuments()
    fetchAgents()
    fetchTeams()
    fetchImages()
  }, [fetchDocuments, fetchAgents, fetchTeams, fetchImages])

  // Polling quand des documents sont en processing/pending
  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === 'processing' || d.status === 'pending'
    )

    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchDocuments()
      }, 5000)
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [documents, fetchDocuments])

  function openCreateDialog() {
    setEditing(null)
    setFormTab('text')
    setFormTeamIds([])
    setFormName('')
    setFormDescription('')
    setFormTextContent('')
    setFormFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
  }

  function openEditDialog(doc: DocWithTeamIds) {
    setEditing(doc)
    setFormTab(doc.doc_type)
    setFormTeamIds(doc.team_ids || (doc.team_id ? [doc.team_id] : []))
    setFormName(doc.name)
    setFormDescription(doc.description || '')
    setFormTextContent(doc.text_content || '')
    setFormFile(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error(t('knowledge.name_required'))
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: formName.trim(),
          description: formDescription.trim(),
          team_ids: formTeamIds,
        }
        if (editing.doc_type === 'text') {
          body.text_content = formTextContent.trim()
        }

        const res = await fetch(`/api/knowledge/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === editing.id ? json.data : d))
          )
          toast.success(t('knowledge.doc_edited'))
          setDialogOpen(false)
        } else {
          toast.error(json.error || t('knowledge.doc_edit_error'))
        }
      } else {
        if (formTab === 'pdf') {
          if (!formFile) {
            toast.error(t('knowledge.pdf_required'))
            setSaving(false)
            return
          }
          const formData = new FormData()
          formData.append('file', formFile)
          formData.append('name', formName.trim())
          formData.append('description', formDescription.trim())
          if (formTeamIds.length > 0) {
            formData.append('team_ids', JSON.stringify(formTeamIds))
          }

          const res = await fetch('/api/knowledge', {
            method: 'POST',
            body: formData,
          })
          const json = await res.json()
          if (res.ok && json.data) {
            setDocuments((prev) => [json.data, ...prev])
            toast.success(t('knowledge.pdf_uploaded'))
            setDialogOpen(false)
          } else {
            toast.error(json.error || t('knowledge.upload_error'))
          }
        } else {
          if (!formTextContent.trim()) {
            toast.error(t('knowledge.content_required'))
            setSaving(false)
            return
          }
          const res = await fetch('/api/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formName.trim(),
              description: formDescription.trim(),
              text_content: formTextContent.trim(),
              team_ids: formTeamIds,
            }),
          })
          const json = await res.json()
          if (res.ok && json.data) {
            setDocuments((prev) => [json.data, ...prev])
            toast.success(t('knowledge.doc_created'))
            setDialogOpen(false)
          } else {
            toast.error(json.error || t('knowledge.create_error'))
          }
        }
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  function openDeleteDialog(doc: KnowledgeDocument) {
    setDocToDelete(doc)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!docToDelete) return
    setDeleting(docToDelete.id)
    try {
      const res = await fetch(`/api/knowledge/${docToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id))
        toast.success(t('knowledge.doc_deleted'))
        setDeleteDialogOpen(false)
        setDocToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('knowledge.doc_delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(null)
    }
  }

  async function handleReprocess(id: string) {
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess: true }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === id ? json.data : d))
        )
        toast.success(t('knowledge.reprocess_started'))
      } else {
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function openAgentDialog(doc: KnowledgeDocument) {
    setSelectedDoc(doc)
    setAgentDialogOpen(true)

    try {
      const res = await fetch(`/api/knowledge/${doc.id}/agents`)
      const json = await res.json()
      if (res.ok && json.data) {
        setDocAgentIds(json.data)
      }
    } catch {
      setDocAgentIds([])
    }
  }

  function toggleAgentId(agentId: string) {
    setDocAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    )
  }

  async function handleSaveAgents() {
    if (!selectedDoc) return

    setSavingAgents(true)
    try {
      const res = await fetch(`/api/knowledge/${selectedDoc.id}/agents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_ids: docAgentIds }),
      })
      if (res.ok) {
        toast.success(t('knowledge.agents_updated'))
        setAgentDialogOpen(false)
      } else {
        const json = await res.json()
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSavingAgents(false)
    }
  }

  async function handleDownload(doc: KnowledgeDocument) {
    try {
      const res = await fetch(`/api/knowledge/${doc.id}/download`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || t('knowledge.download_error'))
        return
      }

      if (json.type === 'pdf') {
        window.open(json.url, '_blank')
      } else {
        const blob = new Blob([json.content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${json.name || 'document'}.txt`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleView(doc: KnowledgeDocument) {
    if (doc.doc_type === 'pdf') {
      handleDownload(doc)
      return
    }

    setViewLoading(true)
    setViewDialogOpen(true)
    setViewDoc(null)
    try {
      const res = await fetch(`/api/knowledge/${doc.id}/download`)
      const json = await res.json()
      if (res.ok) {
        setViewDoc({ name: json.name, content: json.content })
      } else {
        toast.error(json.error || t('knowledge.load_error'))
        setViewDialogOpen(false)
      }
    } catch {
      toast.error(t('common.network_error'))
      setViewDialogOpen(false)
    } finally {
      setViewLoading(false)
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
        <div data-tour="knowledge-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('knowledge.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('knowledge.description')}
          </p>
        </div>
        {pageTab === 'documents' ? (
          <Button data-tour="upload-btn" onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t('knowledge.new_document')}
          </Button>
        ) : (
          <Button onClick={() => setImageDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une image
          </Button>
        )}
      </div>

      <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'documents' | 'images')} className="mb-6">
        <TabsList>
          <TabsTrigger value="documents">
            <FileText className="mr-2 h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="mr-2 h-4 w-4" />
            Images IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="images" className="mt-4">
          {imagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">Aucune image</h3>
                <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
                  Ajoutez des images avec une référence. L&apos;agent IA pourra les envoyer en écrivant <code className="bg-muted px-1 rounded">[IMAGE:ma-ref]</code> dans sa réponse.
                </p>
                <Button className="mt-4" onClick={() => setImageDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter une image
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {images.map((img) => (
                <Card key={img.id} className="overflow-hidden">
                  <div
                    className="relative h-36 bg-muted cursor-pointer"
                    onClick={() => loadImagePreview(img)}
                  >
                    {imagePreviewUrls[img.id] ? (
                      <img
                        src={imagePreviewUrls[img.id]}
                        alt={img.ref}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <code className="text-xs font-mono font-medium truncate">{img.ref}</code>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{img.filename}</p>
                    {/* Agent associé — éditable inline */}
                    {imageEditingAgentId === img.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          className="flex-1 rounded border bg-background px-2 py-1 text-[11px]"
                          defaultValue={img.agent_id || ''}
                          autoFocus
                          onChange={(e) => handleUpdateImageAgent(img.id, e.target.value || null)}
                          onBlur={() => setImageEditingAgentId(null)}
                          disabled={imageAgentSaving === img.id}
                        >
                          <option value="">Tous les agents</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        {imageAgentSaving === img.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors w-full text-left"
                        onClick={() => setImageEditingAgentId(img.id)}
                        title="Cliquer pour modifier l'agent"
                      >
                        <Bot className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {img.agent_id
                            ? agents.find(a => a.id === img.agent_id)?.name || 'Agent inconnu'
                            : 'Tous les agents'}
                        </span>
                        <span className="ml-auto text-[10px] opacity-50">modifier</span>
                      </button>
                    )}
                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={async () => {
                          const url = await loadImagePreview(img)
                          if (url) window.open(url, '_blank')
                        }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Voir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDeleteImage(img.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Supprimer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t('knowledge.no_documents')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('knowledge.no_documents_desc')}
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {t('knowledge.add_document')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const isDeleting = deleting === doc.id

            return (
              <Card key={doc.id}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    <FileText className="mr-1 inline h-4 w-4" />
                    {doc.name}
                  </CardTitle>
                  {statusBadge(doc.status)}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {doc.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {typeBadge(doc.doc_type)}
                      {(doc.team_ids?.length || doc.team_id) && (
                        <>
                          {(doc.team_ids || (doc.team_id ? [doc.team_id] : [])).map(tid => (
                            <Badge key={tid} variant="outline" className="text-xs">
                              <Users className="mr-1 h-3 w-3" />
                              {teams.find((tm) => tm.id === tid)?.name || t('common.team')}
                            </Badge>
                          ))}
                        </>
                      )}
                      {doc.status === 'ready' && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {doc.chunk_count} {t('knowledge.chunks')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {doc.char_count.toLocaleString()} {t('knowledge.chars')}
                          </span>
                        </>
                      )}
                    </div>

                    {doc.status === 'error' && doc.error_message && (
                      <p className="text-xs text-destructive truncate">
                        {doc.error_message}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleView(doc)}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      {t('common.view')}
                    </Button>

                    {doc.doc_type === 'pdf' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="mr-1 h-3 w-3" />
                        {t('common.download')}
                      </Button>
                    )}

                    {doc.doc_type === 'text' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(doc)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        {t('common.edit')}
                      </Button>
                    )}

                    {doc.doc_type === 'pdf' && teams.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(doc)}
                      >
                        <Users className="mr-1 h-3 w-3" />
                        {t('common.team')}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAgentDialog(doc)}
                    >
                      <Bot className="mr-1 h-3 w-3" />
                      {t('common.agents')}
                    </Button>

                    {(doc.status === 'error' || doc.status === 'ready') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReprocess(doc.id)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        {t('knowledge.reprocess')}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(doc)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      {t('common.delete')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('knowledge.edit_document') : t('knowledge.new_document_title')}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? t('knowledge.edit_document_desc')
                : t('knowledge.new_document_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {teams.length > 0 && (
              <MultiTeamSelect
                teams={teams}
                selectedTeamIds={formTeamIds}
                onTeamIdsChange={setFormTeamIds}
                label={t('knowledge.teams_label')}
                description={t('knowledge.teams_desc')}
                emptyDescription={t('knowledge.teams_empty')}
              />
            )}

            {!editing && (
              <Tabs value={formTab} onValueChange={setFormTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">
                    <FileText className="mr-2 h-4 w-4" />
                    {t('knowledge.text')}
                  </TabsTrigger>
                  <TabsTrigger value="pdf">
                    <Upload className="mr-2 h-4 w-4" />
                    {t('knowledge.pdf')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-name-text">{t('knowledge.name_label')}</Label>
                    <Input
                      id="doc-name-text"
                      placeholder={t('knowledge.name_placeholder')}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-desc-text">{t('knowledge.description_label')}</Label>
                    <Input
                      id="doc-desc-text"
                      placeholder={t('knowledge.description_placeholder')}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-content">{t('knowledge.content_label')}</Label>
                    <Textarea
                      id="doc-content"
                      placeholder={t('knowledge.content_placeholder')}
                      value={formTextContent}
                      onChange={(e) => setFormTextContent(e.target.value)}
                      rows={12}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('knowledge.content_help')}
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="pdf" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-name-pdf">{t('knowledge.name_label')}</Label>
                    <Input
                      id="doc-name-pdf"
                      placeholder={t('knowledge.name_placeholder_new')}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-desc-pdf">{t('knowledge.description_label')}</Label>
                    <Input
                      id="doc-desc-pdf"
                      placeholder={t('knowledge.description_placeholder_new')}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-file">{t('knowledge.pdf_label')}</Label>
                    <Input
                      ref={fileInputRef}
                      id="doc-file"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('knowledge.pdf_help')}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {editing && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t('knowledge.name_label')}</Label>
                  <Input
                    id="edit-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-desc">{t('knowledge.description_label')}</Label>
                  <Input
                    id="edit-desc"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                {editing.doc_type === 'text' && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-content">{t('knowledge.content_label')}</Label>
                    <Textarea
                      id="edit-content"
                      value={formTextContent}
                      onChange={(e) => setFormTextContent(e.target.value)}
                      rows={12}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('knowledge.edit_help')}
                    </p>
                  </div>
                )}
              </>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="mr-2 h-4 w-4" />
              )}
              {editing ? t('common.save') : t('knowledge.add_btn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Association Dialog */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('knowledge.assign_agents_title')}</DialogTitle>
            <DialogDescription>
              {t('knowledge.assign_agents_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('knowledge.no_agents_for_kb')}
              </p>
            ) : (
              agents.map((agent) => {
                const isSelected = docAgentIds.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => toggleAgentId(agent.id)}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium truncate">{agent.name}</span>
                        {!agent.is_active && (
                          <Badge variant="secondary" className="text-xs">{t('common.inactive')}</Badge>
                        )}
                      </div>
                      {agent.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {agent.description}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })
            )}

            <Button
              onClick={handleSaveAgents}
              disabled={savingAgents}
              className="w-full mt-2"
            >
              {savingAgents ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Document Dialog (texte) */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <FileText className="mr-2 inline h-4 w-4" />
              {viewDoc?.name || 'Document'}
            </DialogTitle>
            <DialogDescription>
              {t('knowledge.document_content')}
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : viewDoc ? (
            <div className="flex-1 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-4 text-sm font-mono">
                {viewDoc.content}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setDocToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('knowledge.delete_title')}
        description={t('knowledge.delete_desc', { name: docToDelete?.name || '' })}
        loading={deleting === docToDelete?.id}
      />

      {/* Dialog upload image */}
      <Dialog open={imageDialogOpen} onOpenChange={(open) => {
        setImageDialogOpen(open)
        if (!open) { setImageFile(null); setImageRef(''); setImageAgentId('') }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter une image</DialogTitle>
            <DialogDescription>
              L&apos;agent IA pourra envoyer cette image en écrivant <code className="bg-muted px-1 rounded text-xs">[IMAGE:votre-ref]</code> dans sa réponse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Référence <span className="text-destructive">*</span></Label>
              <Input
                placeholder="ex: menu-burger, tarif-2024"
                value={imageRef}
                onChange={(e) => setImageRef(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              />
              <p className="text-xs text-muted-foreground">Lettres, chiffres, tirets uniquement. Unique par compte.</p>
            </div>
            <div className="space-y-2">
              <Label>Image <span className="text-destructive">*</span></Label>
              <Input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF — max 5 Mo</p>
            </div>
            {imageFile && (
              <img
                src={URL.createObjectURL(imageFile)}
                alt="preview"
                className="h-32 w-full rounded-lg object-cover border"
              />
            )}
            <div className="space-y-2">
              <Label>Agent associé (optionnel)</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={imageAgentId}
                onChange={(e) => setImageAgentId(e.target.value)}
              >
                <option value="">Tous les agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleImageUpload}
              disabled={imageSaving || !imageFile || !imageRef.trim()}
              className="w-full"
            >
              {imageSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Uploader l&apos;image
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
