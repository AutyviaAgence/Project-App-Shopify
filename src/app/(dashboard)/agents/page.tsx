'use client'

import { useEffect, useState, useCallback } from 'react'
import type { AIAgent } from '@/types/database'
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
  Bot,
  Trash2,
  Pencil,
  Loader2,
  Brain,
} from 'lucide-react'

export default function AgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AIAgent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSystemPrompt, setFormSystemPrompt] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [formTemperature, setFormTemperature] = useState('0.7')
  const [formDelayMin, setFormDelayMin] = useState('0')
  const [formDelayMax, setFormDelayMax] = useState('0')

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data)
      }
    } catch {
      toast.error('Erreur lors du chargement des agents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  function openCreateDialog() {
    setEditing(null)
    setFormName('')
    setFormDescription('')
    setFormSystemPrompt('')
    setFormObjective('')
    setFormModel('gpt-4o-mini')
    setFormTemperature('0.7')
    setFormDelayMin('0')
    setFormDelayMax('0')
    setDialogOpen(true)
  }

  function openEditDialog(agent: AIAgent) {
    setEditing(agent)
    setFormName(agent.name)
    setFormDescription(agent.description || '')
    setFormSystemPrompt(agent.system_prompt)
    setFormObjective(agent.objective || '')
    setFormModel(agent.model)
    setFormTemperature(String(agent.temperature))
    setFormDelayMin(String(agent.response_delay_min ?? 0))
    setFormDelayMax(String(agent.response_delay_max ?? 0))
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formSystemPrompt.trim()) {
      toast.error('Nom et prompt système sont requis')
      return
    }

    const temp = parseFloat(formTemperature)
    if (isNaN(temp) || temp < 0 || temp > 2) {
      toast.error('La température doit être entre 0 et 2')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/agents/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setAgents((prev) => prev.map((a) => (a.id === editing.id ? json.data : a)))
          toast.success('Agent modifié')
          setDialogOpen(false)
        } else {
          toast.error(json.error || 'Erreur lors de la modification')
        }
      } else {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setAgents((prev) => [json.data, ...prev])
          toast.success('Agent créé')
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
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== id))
        toast.success('Agent supprimé')
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

  async function handleToggleActive(agent: AIAgent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !agent.is_active }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? json.data : a)))
        toast.success(json.data.is_active ? 'Agent activé' : 'Agent désactivé')
      }
    } catch {
      toast.error('Erreur réseau')
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
          <h1 className="text-2xl font-bold">Agents IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez des agents intelligents pour répondre automatiquement sur WhatsApp.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvel agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez votre premier agent IA pour automatiser vos réponses WhatsApp.
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Créer un agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const isDeleting = deleting === agent.id

            return (
              <Card key={agent.id} className={!agent.is_active ? 'opacity-60' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium truncate">
                    <Bot className="mr-1 inline h-4 w-4" />
                    {agent.name}
                  </CardTitle>
                  <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                    {agent.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {agent.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {agent.model}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        T° {agent.temperature}
                      </span>
                      {(agent.response_delay_min > 0 || agent.response_delay_max > 0) && (
                        <span className="text-xs text-muted-foreground">
                          Délai {agent.response_delay_min}–{agent.response_delay_max}s
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {agent.system_prompt}
                    </p>

                    {agent.objective && (
                      <p className="text-xs text-muted-foreground truncate">
                        Objectif : {agent.objective}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(agent)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(agent.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Supprimer
                    </Button>
                    <div className="ml-auto">
                      <Switch
                        checked={agent.is_active}
                        onCheckedChange={() => handleToggleActive(agent)}
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\'agent' : 'Nouvel agent IA'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifiez les paramètres de votre agent.'
                : 'Configurez un agent IA pour répondre automatiquement sur WhatsApp.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Nom *</Label>
              <Input
                id="agent-name"
                placeholder="Ex: Support Client"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <Textarea
                id="agent-description"
                placeholder="Ex: Agent de support pour répondre aux questions fréquentes"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt">Prompt système *</Label>
              <Textarea
                id="agent-prompt"
                placeholder="Ex: Tu es un assistant de support client pour l'entreprise X. Tu réponds de manière professionnelle et concise aux questions des clients..."
                value={formSystemPrompt}
                onChange={(e) => setFormSystemPrompt(e.target.value)}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Instructions données à l&apos;IA pour définir son comportement et sa personnalité.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-objective">Objectif</Label>
              <Input
                id="agent-objective"
                placeholder="Ex: Qualifier les leads et prendre des rendez-vous"
                value={formObjective}
                onChange={(e) => setFormObjective(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent-model">Modèle</Label>
                <Select value={formModel} onValueChange={setFormModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-temperature">Température</Label>
                <Input
                  id="agent-temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={formTemperature}
                  onChange={(e) => setFormTemperature(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  0 = précis, 2 = créatif
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Délai de réponse (secondes)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="agent-delay-min" className="text-xs text-muted-foreground">Minimum</Label>
                  <Input
                    id="agent-delay-min"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMin}
                    onChange={(e) => setFormDelayMin(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="agent-delay-max" className="text-xs text-muted-foreground">Maximum</Label>
                  <Input
                    id="agent-delay-max"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMax}
                    onChange={(e) => setFormDelayMax(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Délai aléatoire entre min et max avant de répondre. Regroupe les messages
                consécutifs et simule un comportement humain. 0/0 = réponse immédiate.
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formSystemPrompt.trim()}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Enregistrer' : 'Créer l\'agent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
