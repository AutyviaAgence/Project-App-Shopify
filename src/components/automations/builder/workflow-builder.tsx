'use client'

import React, { useCallback, useState } from 'react'
import { WorkflowCanvas } from './workflow-canvas'
import { NodeConfig } from './node-config'
import { PhonePreview } from '@/components/automations/phone-preview'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'

function templateSamples(tpl?: WhatsAppTemplate): string[] {
  if (!tpl) return []
  const keys = (tpl.variable_keys as string[]) || []
  if (keys.length > 0) return keys.map((k) => VARIABLE_BY_KEY[k]?.sample || 'exemple')
  return (tpl.sample_values as string[]) || []
}

/**
 * Builder complet : canvas drag & drop (gauche) + panneau (droite).
 * Le panneau montre la config du nœud sélectionné ; si c'est un nœud "action",
 * on affiche AUSSI l'aperçu téléphone du message.
 */
export function WorkflowBuilder({
  graph,
  templates,
  storeName,
  onChange,
}: {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  storeName: string
  onChange: (g: WorkflowGraph) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const templateName = useCallback((id: string | null) => templates.find((t) => t.id === id)?.name, [templates])

  // Met à jour un nœud (patch) et propage.
  const patchNode = useCallback((nodeId: string, patch: Partial<WorkflowNode>) => {
    const next: WorkflowGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => n.id === nodeId ? ({ ...n, ...patch } as WorkflowNode) : n),
    }
    onChange(next)
  }, [graph, onChange])

  const selectedNode = graph.nodes.find((n) => n.id === selectedId)
  const selectedTpl = selectedNode?.type === 'action'
    ? templates.find((t) => t.id === selectedNode.templateId)
    : undefined

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px_300px]">
      {/* Canvas */}
      <div className="overflow-hidden rounded-2xl border bg-muted/20">
        <WorkflowCanvas
          graph={graph}
          templateName={templateName}
          onChange={onChange}
          onSelect={setSelectedId}
        />
      </div>

      {/* Colonne 2 : configuration du nœud sélectionné */}
      <div className="overflow-y-auto">
        {!selectedNode ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
            Cliquez sur un bloc pour le configurer.<br />
            Ajoutez Délai / Condition / Message via la barre en haut à gauche.
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-4">
            <NodeConfig graph={graph} nodeId={selectedNode.id} templates={templates} onPatch={patchNode} />
          </div>
        )}
      </div>

      {/* Colonne 3 (tout à droite) : aperçu téléphone */}
      <div className="hidden overflow-y-auto lg:block">
        {selectedTpl ? (
          <div className="sticky top-0 rounded-2xl border bg-card p-3">
            <PhonePreview
              storeName={storeName}
              eventLabel="Aperçu"
              delayLabel="Immédiat"
              headerText={selectedTpl.header_text || undefined}
              bodyText={selectedTpl.body_text}
              footerText={selectedTpl.footer_text || undefined}
              samples={templateSamples(selectedTpl)}
              mediaType={selectedTpl.header_type}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Sélectionnez un bloc <b className="mx-1 text-green-600">Message</b> pour voir l’aperçu.
          </div>
        )}
      </div>
    </div>
  )
}
