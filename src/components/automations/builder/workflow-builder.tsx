'use client'

import React, { useCallback, useState } from 'react'
import { Timeline } from './timeline'
import { insertAfter, removeNode, patchNode as patchNodeGraph } from './timeline-model'
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
 * Builder = Timeline verticale (centre) + iPhone d'aperçu (droite).
 * La config de chaque bloc est inline dans le bloc (style Loops.so). Pas de
 * drag & drop : structure alignée automatiquement, impossible de se perdre.
 */
export function WorkflowBuilder({
  graph, templates, storeName, onChange,
}: {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  storeName: string
  onChange: (g: WorkflowGraph) => void
}) {
  // Dernier modèle choisi → alimente l'aperçu téléphone.
  const [previewTplId, setPreviewTplId] = useState<string | null>(null)

  const onPatch = useCallback((id: string, patch: Partial<WorkflowNode>) => onChange(patchNodeGraph(graph, id, patch)), [graph, onChange])
  const onInsert = useCallback((afterId: string, kind: 'delay' | 'condition' | 'action', branch?: 'yes' | 'no') => onChange(insertAfter(graph, afterId, kind, branch)), [graph, onChange])
  const onDelete = useCallback((id: string) => onChange(removeNode(graph, id)), [graph, onChange])

  // Modèle à prévisualiser : le dernier sélectionné, sinon le 1er nœud action.
  const firstActionTpl = graph.nodes.find((n) => n.type === 'action' && n.templateId)
  const previewId = previewTplId || (firstActionTpl?.type === 'action' ? firstActionTpl.templateId : null)
  const previewTpl = templates.find((t) => t.id === previewId)

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Timeline centrale (scrollable) */}
      <div className="overflow-y-auto rounded-2xl border bg-muted/10 px-4">
        <Timeline
          graph={graph}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          onPatch={onPatch}
          onInsert={onInsert}
          onDelete={onDelete}
          onSelectAction={setPreviewTplId}
        />
      </div>

      {/* iPhone d'aperçu (tout à droite) */}
      <div className="hidden overflow-y-auto lg:block">
        {previewTpl ? (
          <div className="sticky top-0">
            <PhonePreview
              storeName={storeName}
              eventLabel="Aperçu"
              delayLabel="Immédiat"
              headerText={previewTpl.header_text || undefined}
              bodyText={previewTpl.body_text}
              footerText={previewTpl.footer_text || undefined}
              samples={templateSamples(previewTpl)}
              mediaType={previewTpl.header_type}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Choisissez un modèle dans un bloc <b className="mx-1 text-green-600">Message</b> pour voir l’aperçu.
          </div>
        )}
      </div>
    </div>
  )
}
