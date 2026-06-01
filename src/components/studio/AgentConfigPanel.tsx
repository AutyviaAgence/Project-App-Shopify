'use client'

import { useState, useEffect } from 'react'
import type { AIAgent } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  X, Save, Loader2, Bot, ChevronDown, ChevronUp,
  GitBranch, Wrench, Power, PowerOff, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AgentTestChat } from '@/components/agent-test-chat'

interface AgentConfigPanelProps {
  agent: AIAgent
  onClose: () => void
  onUpdate: (updated: AIAgent) => void
  onDelete: () => void
}

export function AgentConfigPanel({ agent, onClose, onUpdate, onDelete }: AgentConfigPanelProps) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  // Form state
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description || '')
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [shortPrompt, setShortPrompt] = useState('')
  const [model, setModel] = useState(agent.model || 'gpt-4o-mini')
  const [temperature, setTemperature] = useState(agent.temperature ?? 0.7)
  const [isActive, setIsActive] = useState(agent.is_active)
  const [bookingUrl, setBookingUrl] = useState(agent.booking_url || '')
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(agent.auto_detect_language)
  const [escalationEnabled, setEscalationEnabled] = useState(agent.escalation_enabled)
  const [escalationMessage, setEscalationMessage] = useState(agent.escalation_message || '')
  const [stopCondition, setStopCondition] = useState(agent.stop_condition || '')

  // Sync quand l'agent change
  useEffect(() => {
    setName(agent.name)
    setDescription(agent.description || '')
    setSystemPrompt(agent.system_prompt)
    setModel(agent.model || 'gpt-4o-mini')
    setTemperature(agent.temperature ?? 0.7)
    setIsActive(agent.is_active)
    setBookingUrl(agent.booking_url || '')
    setAutoDetectLanguage(agent.auto_detect_language)
    setEscalationEnabled(agent.escalation_enabled)
    setEscalationMessage(agent.escalation_message || '')
    setStopCondition(agent.stop_condition || '')
  }, [agent.id])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          system_prompt: systemPrompt,
          model,
          temperature,
          is_active: isActive,
          booking_url: bookingUrl.trim() || null,
          auto_detect_language: autoDetectLanguage,
          escalation_enabled: escalationEnabled,
          escalation_message: escalationMessage.trim() || null,
          stop_condition: stopCondition.trim() || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        onUpdate(json.data)
        toast.success('Agent mis à jour')
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="w-72 flex-shrink-0 flex flex-col h-full border-r bg-background shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm font-semibold truncate">{agent.name}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Actions rapides */}
        <div className="flex items-center gap-1 border-b px-3 py-2">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => setTestOpen(true)}>
            ▶ Tester
          </Button>
          <Link href={`/agents/${agent.id}/workflow`} className="flex-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full">
              <GitBranch className="mr-1 h-3 w-3" /> Workflow
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-7 w-7 p-0', isActive ? 'text-emerald-500' : 'text-muted-foreground')}
            onClick={async () => {
              setIsActive(!isActive)
              await fetch(`/api/agents/${agent.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !isActive }),
              })
              onUpdate({ ...agent, is_active: !isActive })
            }}
            title={isActive ? 'Désactiver' : 'Activer'}
          >
            {isActive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Formulaire scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

          {/* Infos de base */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-7 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Rôle de l'agent..." className="h-7 text-xs" />
            </div>
          </div>

          {/* Prompt simplifié */}
          <div className="space-y-1.5">
            <Label className="text-xs">Que fait cet agent ?</Label>
            <Textarea
              value={shortPrompt || systemPrompt.slice(0, 200)}
              onChange={e => {
                setShortPrompt(e.target.value)
                setSystemPrompt(e.target.value)
              }}
              placeholder="Décris en quelques mots le rôle de cet agent..."
              className="text-xs min-h-[80px] resize-none"
            />
          </div>

          {/* Toggles simples */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Détection de langue auto</Label>
              <Switch checked={autoDetectLanguage} onCheckedChange={setAutoDetectLanguage} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Escalade vers humain</Label>
              <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
            </div>
          </div>

          {escalationEnabled && (
            <div className="space-y-1.5">
              <Label className="text-xs">Message avant escalade</Label>
              <Textarea
                value={escalationMessage}
                onChange={e => setEscalationMessage(e.target.value)}
                placeholder="Je vous transfère à un conseiller..."
                className="text-xs min-h-[60px] resize-none"
              />
            </div>
          )}

          {/* Section Avancé */}
          <button
            className="flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>⚙️ Paramètres avancés</span>
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt système complet</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="text-xs min-h-[120px] resize-none font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modèle IA</Label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (rapide)</option>
                  <option value="gpt-4o">GPT-4o (puissant)</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Créativité : {temperature}</Label>
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Précis</span><span>Équilibré</span><span>Créatif</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lien de réservation</Label>
                <Input
                  value={bookingUrl}
                  onChange={e => setBookingUrl(e.target.value)}
                  placeholder="https://calendly.com/..."
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Condition d&apos;arrêt</Label>
                <Textarea
                  value={stopCondition}
                  onChange={e => setStopCondition(e.target.value)}
                  placeholder="Ex: si le client a confirmé son rendez-vous..."
                  className="text-xs min-h-[60px] resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-2.5 flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
            Enregistrer
          </Button>
        </div>
      </div>

      <AgentTestChat
        open={testOpen}
        onOpenChange={setTestOpen}
        agentId={agent.id}
        agentName={agent.name}
      />
    </>
  )
}
