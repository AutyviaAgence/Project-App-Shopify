'use client'

import React, { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Timeline } from './timeline'
import { insertAfter, removeNode, patchNode as patchNodeGraph } from './timeline-model'
import { PhonePreview } from '@/components/automations/phone-preview'
import { cn } from '@/lib/utils'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'

const Lightfall = dynamic(() => import('@/components/Lightfall'), { ssr: false })

/**
 * Zone de timeline déplaçable : on peut faire défiler le workflow en
 * cliquant-glissant sur le fond (pan), comme un canvas. Le clic sur un bloc
 * ou un bouton reste normal (on n'amorce le pan que sur le fond).
 */
function PannableTimeline({ children }: { children: React.ReactNode }) {
  // Pan (clic-glissé) + ZOOM (molette). On n'amorce le pan que sur le fond.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
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

  function onWheel(e: React.WheelEvent) {
    // Molette = zoom (borné 0.5–2). Ctrl+molette aussi (trackpad pinch).
    e.preventDefault()
    setZoom((z) => Math.min(2, Math.max(0.5, z - e.deltaY * 0.0015)))
  }
  function reset() { setOffset({ x: 0, y: 0 }); setZoom(1) }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={onWheel}
      className={cn('relative overflow-hidden rounded-2xl border bg-background/40 select-none', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
    >
      {/* Fond animé Lightfall, confiné au cadre du canvas (coins arrondis) */}
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <Lightfall
          className="" dpr={1} mixBlendMode="normal"
          colors={['#A6C8FF', '#5227FF', '#FF9FFC']}
          backgroundColor="#0A1530"
          speed={0.5} streakCount={2} streakWidth={1} streakLength={1}
          glow={1} density={0.6} twinkle={1} zoom={3} backgroundGlow={0.5}
          opacity={1} mouseInteraction mouseStrength={0.5} mouseRadius={1}
        />
      </div>
      <div
        className="relative z-[1] h-full origin-top will-change-transform"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: grabbing ? 'none' : 'transform 0.1s ease-out' }}
      >
        {children}
      </div>

      {/* Contrôles zoom + recentrer */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border bg-card px-1 py-1 shadow-sm">
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" title="Dézoomer">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" title="Zoomer">
          <Plus className="h-4 w-4" />
        </button>
        {(offset.x !== 0 || offset.y !== 0 || zoom !== 1) && (
          <button onClick={reset} className="ml-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title="Recentrer">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function templateSamples(tpl?: WhatsAppTemplate): string[] {
  if (!tpl) return []
  const keys = (tpl.variable_keys as string[]) || []
  if (keys.length > 0) return keys.map((k) => VARIABLE_BY_KEY[k]?.sample || 'exemple')
  return (tpl.sample_values as string[]) || []
}

function delayLabelMin(m: number): string {
  if (m <= 0) return 'Immédiat'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} j`
}

/**
 * Remonte du nœud action jusqu'au trigger pour reconstituer le contexte réel :
 * l'événement déclencheur, le délai CUMULÉ, et la condition franchie (avec sa
 * branche). Sert à alimenter la bulle système + l'horloge du mockup.
 */
function pathContext(graph: WorkflowGraph, actionId?: string): { eventValue?: string; delayMin: number; condition?: string } {
  if (!actionId) {
    const trig = graph.nodes.find((n) => n.type === 'trigger')
    return { eventValue: trig?.type === 'trigger' ? trig.event : undefined, delayMin: 0 }
  }
  // chemin inverse : on reconstruit la suite de nœuds parents
  const parents: { from: string; branch?: 'yes' | 'no' }[] = []
  let cur: string | undefined = actionId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const inc = graph.edges.find((e) => e.to === cur)
    if (!inc) break
    parents.unshift({ from: inc.from, branch: inc.branch })
    cur = inc.from
  }
  let delayMin = 0
  let condition: string | undefined
  let eventValue: string | undefined
  for (const p of parents) {
    const node = graph.nodes.find((n) => n.id === p.from)
    if (!node) continue
    if (node.type === 'trigger') eventValue = node.event
    if (node.type === 'delay') delayMin += node.minutes || 0
    if (node.type === 'condition' && p.branch) {
      condition = p.branch === 'yes' ? 'condition remplie' : 'sinon'
    }
  }
  return { eventValue, delayMin, condition }
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
  const firstAction = graph.nodes.find((n) => n.type === 'action' && n.templateId)
  const previewId = previewTplId || (firstAction?.type === 'action' ? firstAction.templateId : null)
  const previewTpl = templates.find((t) => t.id === previewId)

  // Contexte réel du chemin menant à ce message : événement déclencheur,
  // délai cumulé, et condition rencontrée (pour la bulle système du mockup).
  const previewActionNode = graph.nodes.find((n) => n.type === 'action' && n.templateId === previewId)
  const ctx = pathContext(graph, previewActionNode?.id)

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
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

      {/* iPhone d'aperçu (tout à droite) — affiché à partir de xl seulement
          (sur écran moyen/petit, on laisse toute la place au workflow). */}
      <div className="hidden min-h-0 px-4 xl:flex xl:items-center xl:justify-center">
        {previewTpl ? (
          <PhonePreview
            storeName={storeName}
            eventLabel={TRIGGER_EVENTS.find((e) => e.value === ctx.eventValue)?.label || 'Déclencheur'}
            conditionsText={ctx.condition}
            delayLabel={delayLabelMin(ctx.delayMin)}
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
