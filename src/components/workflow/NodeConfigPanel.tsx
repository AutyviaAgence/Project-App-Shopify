'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, Bot, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import Link from 'next/link'
import type { WorkflowNode, AiNodeData, MessageNodeData, RelanceNodeData, ConditionNodeData, EscaladeNodeData, MediaNodeData, TagNodeData, BookingNodeData } from '@/lib/workflow/types'
import type { AIAgent } from '@/types/database'

interface NodeConfigPanelProps {
  node: WorkflowNode
  onUpdate: (nodeId: string, data: Partial<WorkflowNode['data']>) => void
  onClose: () => void
  onDelete: (nodeId: string) => void
}

export function NodeConfigPanel({ node, onUpdate, onClose, onDelete }: NodeConfigPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  function update(partial: Record<string, unknown>) {
    onUpdate(node.id, partial)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Configuration du bloc</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Label commun */}
        <div className="space-y-1.5">
          <Label className="text-xs">Nom du bloc</Label>
          <Input
            value={(node.data as { label?: string }).label || ''}
            onChange={(e) => update({ label: e.target.value })}
            className="h-8 text-sm"
          />
        </div>

        {/* Config spécifique par type */}
        {node.type === 'aiNode' && <AiNodeConfig data={node.data as unknown as AiNodeData} update={update} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} />}
        {node.type === 'messageNode' && <MessageNodeConfig data={node.data as unknown as MessageNodeData} update={update} />}
        {node.type === 'relanceNode' && <RelanceNodeConfig data={node.data as unknown as RelanceNodeData} update={update} />}
        {node.type === 'conditionNode' && <ConditionNodeConfig data={node.data as unknown as ConditionNodeData} update={update} />}
        {node.type === 'escaladeNode' && <EscaladeNodeConfig data={node.data as unknown as EscaladeNodeData} update={update} />}
        {node.type === 'mediaNode' && <MediaNodeConfig data={node.data as unknown as MediaNodeData} update={update} />}
        {node.type === 'tagNode' && <TagNodeConfig data={node.data as unknown as TagNodeData} update={update} />}
        {node.type === 'bookingNode' && <BookingNodeConfig data={node.data as unknown as BookingNodeData} update={update} />}
      </div>

      {/* Supprimer (sauf trigger) */}
      {node.type !== 'triggerNode' && (
        <div className="border-t px-4 py-3">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(node.id)}
          >
            Supprimer ce bloc
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Configs spécifiques ───────────────────────────────────────────────────────

function AiNodeConfig({ data, update, showAdvanced, setShowAdvanced }: {
  data: AiNodeData
  update: (p: Record<string, unknown>) => void
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
}) {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null)
  const [loadingAgent, setLoadingAgent] = useState(false)

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(j => setAgents(j.data || []))
  }, [])

  // Charger les params de l'agent sélectionné
  async function handleSelectAgent(agentId: string) {
    if (!agentId) { setSelectedAgent(null); update({ linkedAgentId: null }); return }
    setLoadingAgent(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`)
      const json = await res.json()
      const agent: AIAgent = json.data
      setSelectedAgent(agent)
      update({
        linkedAgentId: agent.id,
        label: agent.name,
        shortPrompt: agent.description || agent.system_prompt.slice(0, 100),
        systemPrompt: agent.system_prompt,
        model: agent.model,
        temperature: agent.temperature,
        useKnowledge: false,
      })
    } finally {
      setLoadingAgent(false)
    }
  }

  return (
    <>
      {/* Sélecteur d'agent */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Bot className="h-3 w-3" /> Agent IA lié
        </Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-xs"
          value={(data as AiNodeData & { linkedAgentId?: string }).linkedAgentId || ''}
          onChange={e => handleSelectAgent(e.target.value)}
          disabled={loadingAgent}
        >
          <option value="">— Choisir un agent —</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {selectedAgent && (
          <Link href={`/agents`}>
            <button className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
              <ExternalLink className="h-2.5 w-2.5" /> Configurer cet agent
            </button>
          </Link>
        )}
      </div>

      {/* Aperçu du prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs">Description / comportement</Label>
        <Textarea
          value={data.shortPrompt || ''}
          onChange={(e) => update({ shortPrompt: e.target.value, systemPrompt: e.target.value })}
          placeholder="Décris ce que fait cet agent..."
          className="text-xs min-h-[70px] resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={data.useKnowledge || false} onCheckedChange={(v) => update({ useKnowledge: v })} />
        <Label className="text-xs">Base de connaissances</Label>
      </div>

      {/* Section Avancé */}
      <button
        className="flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <span>Paramètres avancés</span>
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt système complet</Label>
            <Textarea
              value={data.systemPrompt || ''}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              placeholder="Prompt système détaillé..."
              className="text-xs min-h-[120px] resize-none font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Modèle IA</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-1.5 text-xs"
              value={data.model || 'gpt-4o-mini'}
              onChange={(e) => update({ model: e.target.value })}
            >
              <option value="gpt-4o-mini">GPT-4o Mini (rapide)</option>
              <option value="gpt-4o">GPT-4o (puissant)</option>
              <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
              <option value="gpt-4.1">GPT-4.1</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Créativité : {data.temperature || 0.7}</Label>
            <input type="range" min="0" max="1" step="0.1"
              value={data.temperature || 0.7}
              onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Précis</span><span>Équilibré</span><span>Créatif</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MessageNodeConfig({ data, update }: { data: MessageNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Message à envoyer</Label>
      <Textarea
        value={data.message || ''}
        onChange={(e) => update({ message: e.target.value })}
        placeholder="Bonjour ! Comment puis-je vous aider ?"
        className="text-sm min-h-[100px] resize-none"
      />
    </div>
  )
}

function RelanceNodeConfig({ data, update }: { data: RelanceNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Délai avant relance</Label>
        <div className="flex gap-2">
          <Input
            type="number" min="1"
            value={data.delayHours || 24}
            onChange={(e) => update({ delayHours: parseInt(e.target.value) })}
            className="h-8 text-sm w-20"
          />
          <span className="text-sm text-muted-foreground self-center">heures</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Nombre max de relances</Label>
        <Input
          type="number" min="1" max="10"
          value={data.maxRelances || 1}
          onChange={(e) => update({ maxRelances: parseInt(e.target.value) })}
          className="h-8 text-sm w-20"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Message de relance</Label>
        <Textarea
          value={data.message || ''}
          onChange={(e) => update({ message: e.target.value })}
          className="text-sm min-h-[80px] resize-none"
        />
      </div>
    </>
  )
}

function ConditionNodeConfig({ data, update }: { data: ConditionNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Type de condition</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={data.condition || 'contains'}
          onChange={(e) => update({ condition: e.target.value })}
        >
          <option value="contains">Le message contient</option>
          <option value="ai_qualified">L&apos;IA a qualifié</option>
          <option value="tag_has">Le contact a le tag</option>
          <option value="no_reply">Pas de réponse depuis X heures</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Valeur / Mots-clés</Label>
        <Input
          value={data.value || ''}
          onChange={(e) => update({ value: e.target.value })}
          placeholder="mot1|mot2|mot3"
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-muted-foreground">Séparez plusieurs valeurs avec |</p>
      </div>
    </>
  )
}

function EscaladeNodeConfig({ data, update }: { data: EscaladeNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Message avant transfert</Label>
      <Textarea
        value={data.message || ''}
        onChange={(e) => update({ message: e.target.value })}
        placeholder="Je vous transfère à un conseiller..."
        className="text-sm min-h-[80px] resize-none"
      />
    </div>
  )
}

function MediaNodeConfig({ data, update }: { data: MediaNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Référence image (depuis la Bibliothèque)</Label>
        <Input
          value={data.imageRef || ''}
          onChange={(e) => update({ imageRef: e.target.value })}
          placeholder="ex: menu-burger"
          className="h-8 text-sm font-mono"
        />
        <p className="text-[10px] text-muted-foreground">La référence doit exister dans votre Bibliothèque</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Message d&apos;accompagnement (optionnel)</Label>
        <Textarea
          value={data.message || ''}
          onChange={(e) => update({ message: e.target.value })}
          className="text-sm min-h-[60px] resize-none"
        />
      </div>
    </>
  )
}

function TagNodeConfig({ data, update }: { data: TagNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Action</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={data.action || 'add'}
          onChange={(e) => update({ action: e.target.value })}
        >
          <option value="add">Ajouter le tag</option>
          <option value="remove">Retirer le tag</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Nom du tag</Label>
        <Input
          value={data.tagName || ''}
          onChange={(e) => update({ tagName: e.target.value })}
          placeholder="lead-chaud"
          className="h-8 text-sm"
        />
      </div>
    </>
  )
}

function BookingNodeConfig({ data, update }: { data: BookingNodeData; update: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Message accompagnant le lien</Label>
      <Textarea
        value={data.message || ''}
        onChange={(e) => update({ message: e.target.value })}
        placeholder="Réservez votre créneau ici :"
        className="text-sm min-h-[60px] resize-none"
      />
      <p className="text-[10px] text-muted-foreground">Le lien de réservation est configuré dans les paramètres de l&apos;agent.</p>
    </div>
  )
}
