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
    <div className="grid h-[560px] grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      {/* Canvas */}
      <div className="overflow-hidden rounded-2xl border bg-muted/20">
        <WorkflowCanvas
          graph={graph}
          templateName={templateName}
          onChange={onChange}
          onSelect={setSelectedId}
        />
      </div>

      {/* Panneau droit */}
      <div className="flex flex-col gap-4 overflow-y-auto">
        {!selectedNode ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
            Cliquez sur un bloc pour le configurer.<br />
            Utilisez la barre en haut à gauche pour ajouter Délai / Condition / Message.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-4">
              <NodeConfig graph={graph} nodeId={selectedNode.id} templates={templates} onPatch={patchNode} />
            </div>

            {/* Aperçu téléphone pour un nœud action avec modèle choisi */}
            {selectedTpl && (
              <div className="rounded-2xl border bg-card p-3">
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
            )}
          </>
        )}
      </div>
    </div>
  )
}
