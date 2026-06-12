'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Timeline } from './timeline'
import { insertAfter, removeNode, patchNode as patchNodeGraph } from './timeline-model'
import { PhonePreview } from '@/components/automations/phone-preview'
import { cn } from '@/lib/utils'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'

/**
 * Zone de timeline déplaçable : on peut faire défiler le workflow en
 * cliquant-glissant sur le fond (pan), comme un canvas. Le clic sur un bloc
 * ou un bouton reste normal (on n'amorce le pan que sur le fond).
 */
function PannableTimeline({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  function onPointerDown(e: React.PointerEvent) {
    // On n'amorce le pan que si on clique sur le FOND (pas un bouton/input/bloc).
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, [role="button"], [data-block]')) return
    const el = ref.current
    if (!el) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    setGrabbing(true)
    el.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !ref.current) return
    ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
    ref.current.scrollTop = drag.current.top - (e.clientY - drag.current.y)
  }
  function endDrag() { drag.current = null; setGrabbing(false) }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className={cn('overflow-auto rounded-2xl border bg-muted/10 px-4 select-none', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
    >
      {children}
    </div>
  )
}

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
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Timeline centrale (déplaçable au clic-glissé) */}
      <PannableTimeline>
        <Timeline
          graph={graph}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          onPatch={onPatch}
          onInsert={onInsert}
          onDelete={onDelete}
          onSelectAction={setPreviewTplId}
        />
      </PannableTimeline>

      {/* iPhone d'aperçu (tout à droite) — plus grand et centré verticalement */}
      <div className="hidden lg:flex lg:items-center lg:justify-center">
        {previewTpl ? (
          <PhonePreview
            storeName={storeName}
            eventLabel="Aperçu"
            delayLabel="Immédiat"
            headerText={previewTpl.header_text || undefined}
            bodyText={previewTpl.body_text}
            footerText={previewTpl.footer_text || undefined}
            samples={templateSamples(previewTpl)}
            mediaType={previewTpl.header_type}
            scale={0.92}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Choisissez un modèle dans un bloc <b className="mx-1 text-green-600">Message</b> pour voir l’aperçu.
          </div>
        )}
      </div>
    </div>
  )
}
