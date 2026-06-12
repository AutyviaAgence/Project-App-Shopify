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
  // Pan libre via translate (on peut déplacer le workflow dans tous les sens,
  // même s'il tient dans la zone). On n'amorce que sur le fond (pas un bloc).
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, [role="button"], [data-block]')) return
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
    setGrabbing(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.sx), y: drag.current.oy + (e.clientY - drag.current.sy) })
  }
  function endDrag() { drag.current = null; setGrabbing(false) }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className={cn('relative overflow-hidden rounded-2xl border bg-muted/10 select-none', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
    >
      <div
        className="h-full origin-top will-change-transform"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, transition: grabbing ? 'none' : 'transform 0.1s ease-out' }}
      >
        {children}
      </div>
      {/* Bouton recentrer */}
      {(offset.x !== 0 || offset.y !== 0) && (
        <button
          onClick={() => setOffset({ x: 0, y: 0 })}
          className="absolute bottom-3 right-3 z-10 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:bg-muted"
        >
          Recentrer
        </button>
      )}
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
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* Timeline centrale (déplaçable au clic-glissé). max-width pour ne pas
          occuper toute la largeur → le workflow respire. */}
      <PannableTimeline>
        <div className="mx-auto w-full max-w-2xl">
          <Timeline
            graph={graph}
            templates={templates.map((t) => ({ id: t.id, name: t.name }))}
            onPatch={onPatch}
            onInsert={onInsert}
            onDelete={onDelete}
            onSelectAction={setPreviewTplId}
          />
        </div>
      </PannableTimeline>

      {/* iPhone d'aperçu (tout à droite) — plus d'air horizontal */}
      <div className="hidden px-6 lg:flex lg:items-center lg:justify-center">
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
            scale={0.82}
            mascot
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
