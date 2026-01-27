'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { KnowledgeDocument, AIAgent } from '@/types/database'
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
} from 'lucide-react'

function statusBadge(status: string) {
  switch (status) {
    case 'ready':
      return <Badge className="bg-green-600 text-white">Prêt</Badge>
    case 'processing':
      return (
        <Badge className="bg-blue-600 text-white">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Traitement...
        </Badge>
      )
    case 'pending':
      return <Badge variant="secondary">En attente</Badge>
    case 'error':
      return <Badge variant="destructive">Erreur</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function typeBadge(docType: string) {
  return docType === 'pdf' ? (
    <Badge variant="outline" className="text-xs">
      <Upload className="mr-1 h-3 w-3" />
      PDF
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs">
      <FileText className="mr-1 h-3 w-3" />
      Texte
    </Badge>
  )
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null)
  const [formTab, setFormTab] = useState<string>('text')
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

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge')
      const json = await res.json()
      if (res.ok && json.data) {
        setDocuments(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des documents')
    } finally {
      setLoading(false)
    }
  }, [])

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

  useEffect(() => {
    fetchDocuments()
    fetchAgents()
  }, [fetchDocuments, fetchAgents])

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
    setFormName('')
    setFormDescription('')
    setFormTextContent('')
    setFormFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setDialogOpen(true)
  }

  function openEditDialog(doc: KnowledgeDocument) {
    setEditing(doc)
    setFormTab(doc.doc_type)
    setFormName(doc.name)
    setFormDescription(doc.description || '')
    setFormTextContent(doc.text_content || '')
    setFormFile(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error('Le nom est requis')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        // PATCH : modifier le document existant
        const body: Record<string, unknown> = {
          name: formName.trim(),
          description: formDescription.trim(),
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
          toast.success('Document modifié')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la modification')
        }
      } else {
        // POST : créer un nouveau document
        if (formTab === 'pdf') {
          if (!formFile) {
            toast.error('Veuillez sélectionner un fichier PDF')
            setSaving(false)
            return
          }
          const formData = new FormData()
          formData.append('file', formFile)
          formData.append('name', formName.trim())
          formData.append('description', formDescription.trim())

          const res = await fetch('/api/knowledge', {
            method: 'POST',
            body: formData,
          })
          const json = await res.json()
          if (res.ok && json.data) {
            setDocuments((prev) => [json.data, ...prev])
            toast.success('PDF uploadé, traitement en cours...')
            setDialogOpen(false)
          } else {
            toast.error(json.error || 'Erreur lors de l\'upload')
          }
        } else {
          if (!formTextContent.trim()) {
            toast.error('Le contenu est requis')
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
            }),
          })
          const json = await res.json()
          if (res.ok && json.data) {
            setDocuments((prev) => [json.data, ...prev])
            toast.success('Document créé, traitement en cours...')
            setDialogOpen(false)
          } else {
            toast.error(json.error || 'Erreur lors de la création')
          }
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
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id))
        toast.success('Document supprimé')
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
        toast.success('Re-traitement lancé')
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  async function openAgentDialog(doc: KnowledgeDocument) {
    setSelectedDoc(doc)
    setAgentDialogOpen(true)

    // Charger les agents associés
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
        toast.success('Agents mis à jour')
        setAgentDialogOpen(false)
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSavingAgents(false)
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
          <h1 className="text-2xl font-bold">Base de connaissances</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoutez des documents que vos agents IA pourront consulter pour enrichir leurs réponses.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau document
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun document</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajoutez votre premier document pour enrichir les connaissances de vos agents IA.
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const isDeleting = deleting === doc.id

            return (
              <Card key={doc.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                      {doc.status === 'ready' && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {doc.chunk_count} chunks
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {doc.char_count.toLocaleString()} car.
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
                    {doc.doc_type === 'text' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(doc)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Modifier
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAgentDialog(doc)}
                    >
                      <Bot className="mr-1 h-3 w-3" />
                      Agents
                    </Button>

                    {(doc.status === 'error' || doc.status === 'ready') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReprocess(doc.id)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Re-traiter
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(doc.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Modifier le document' : 'Nouveau document'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifiez le contenu de votre document.'
                : 'Ajoutez un document texte ou un fichier PDF à votre base de connaissances.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editing && (
              <Tabs value={formTab} onValueChange={setFormTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">
                    <FileText className="mr-2 h-4 w-4" />
                    Texte
                  </TabsTrigger>
                  <TabsTrigger value="pdf">
                    <Upload className="mr-2 h-4 w-4" />
                    PDF
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-name-text">Nom *</Label>
                    <Input
                      id="doc-name-text"
                      placeholder="Ex: FAQ Entreprise"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-desc-text">Description</Label>
                    <Input
                      id="doc-desc-text"
                      placeholder="Ex: Questions fréquemment posées par les clients"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-content">Contenu *</Label>
                    <Textarea
                      id="doc-content"
                      placeholder="Collez ici le contenu de votre document : informations sur l'entreprise, FAQ, descriptions de produits..."
                      value={formTextContent}
                      onChange={(e) => setFormTextContent(e.target.value)}
                      rows={12}
                    />
                    <p className="text-xs text-muted-foreground">
                      Le texte sera découpé en morceaux et indexé pour la recherche sémantique.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="pdf" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc-name-pdf">Nom *</Label>
                    <Input
                      id="doc-name-pdf"
                      placeholder="Ex: Catalogue Produits"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-desc-pdf">Description</Label>
                    <Input
                      id="doc-desc-pdf"
                      placeholder="Ex: Catalogue complet des produits et services"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-file">Fichier PDF *</Label>
                    <Input
                      ref={fileInputRef}
                      id="doc-file"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Max 10 Mo. Le texte sera extrait automatiquement du PDF.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {editing && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nom *</Label>
                  <Input
                    id="edit-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-desc">Description</Label>
                  <Input
                    id="edit-desc"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                {editing.doc_type === 'text' && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-content">Contenu *</Label>
                    <Textarea
                      id="edit-content"
                      value={formTextContent}
                      onChange={(e) => setFormTextContent(e.target.value)}
                      rows={12}
                    />
                    <p className="text-xs text-muted-foreground">
                      La modification du contenu relancera le traitement (chunking + embeddings).
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
              {editing ? 'Enregistrer' : 'Ajouter le document'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Association Dialog */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assigner aux agents</DialogTitle>
            <DialogDescription>
              Sélectionnez les agents IA qui pourront accéder à ce document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun agent IA créé. Créez un agent pour l&apos;associer à ce document.
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
                          <Badge variant="secondary" className="text-xs">Inactif</Badge>
                        )}
                      </div>
                      {agent.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
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
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
