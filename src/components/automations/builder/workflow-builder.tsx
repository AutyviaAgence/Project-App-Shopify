'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Timeline, localizedTemplate } from './timeline'
import { insertAfter, removeNode, patchNode as patchNodeGraph, addVariant, removeVariant, moveBranch } from './timeline-model'
import { PhonePreview } from '@/components/automations/phone-preview'
import { cn } from '@/lib/utils'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'
import { useTranslation } from '@/i18n/context'

const Particles = dynamic(() => import('@/components/Particles'), { ssr: false })

/**
 * Regroupe les modèles par NOM : un modèle multilingue ne doit apparaître qu'UNE
 * fois dans le sélecteur « Envoyer le modèle » (la langue est choisie à l'envoi
 * selon le contact, via resolveLanguageVariant).
 *
 * ⚠️ LA LIGNE GARDÉE SUIT LA LANGUE DE L'INTERFACE.
 *
 * Cette fonction préférait le français EN DUR. Comme elle s'applique AVANT
 * `localizedTemplate`, elle jetait la variante anglaise du tableau : le helper
 * cherchait ensuite un EN qui n'existait plus (46 lignes réduites à 25), et
 * l'aperçu restait obstinément en français pour un marchand anglophone — même
 * quand la variante EN était approuvée.
 *
 * On garde donc : variante dans la langue du marchand > langue source > 'fr'.
 * L'ENVOI n'est pas concerné : il repart de la base et résout la langue du
 * CLIENT via resolveLanguageVariant.
 */
function dedupeByName(templates: WhatsAppTemplate[], locale: string): WhatsAppTemplate[] {
  const want = locale === 'en' ? 'en' : 'fr'
  const byName = new Map<string, WhatsAppTemplate>()
  for (const t of templates) {
    const cur = byName.get(t.name)
    if (!cur) { byName.set(t.name, t); continue }
    // La langue de l'interface l'emporte sur tout le reste (si approuvée).
    const wants = t.language === want && t.status === 'approved'
    const curWants = cur.language === want && cur.status === 'approved'
    if (wants && !curWants) { byName.set(t.name, t); continue }
    if (curWants) continue
    // Sinon : langue source > fr > existant.
    const isSrc = t.source_language && t.language === t.source_language
    const curIsSrc = cur.source_language && cur.language === cur.source_language
    if (isSrc && !curIsSrc) byName.set(t.name, t)
    else if (!curIsSrc && t.language === 'fr' && cur.language !== 'fr') byName.set(t.name, t)
  }
  // Templates complets (dédupliqués par nom) — pour afficher un aperçu dans le nœud.
  return Array.from(byName.values())
}

/**
 * Zone de timeline déplaçable : on peut faire défiler le workflow en
 * cliquant-glissant sur le fond (pan), comme un canvas. Le clic sur un bloc
 * ou un bouton reste normal (on n'amorce le pan que sur le fond).
 */
function PannableTimeline({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  // Pan (clic-glissé) + ZOOM (molette). On n'amorce le pan que sur le fond.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
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

  // Le listener `wheel` doit être attaché NATIVEMENT avec { passive: false } :
  // React l'enregistre en mode passif, où `preventDefault()` est ignoré — Ctrl +
  // molette zoomait alors la PAGE entière au lieu du canvas.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Les menus Radix (Select, Popover…) sont montés dans un portail hors du
      // canvas, mais l'évènement remonte jusqu'ici : sans ce garde, la molette
      // déplaçait le canvas au lieu de faire défiler le menu ouvert.
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[data-radix-popper-content-wrapper],[role="listbox"],[role="dialog"]')) return

      e.preventDefault()
      // Ctrl/⌘ + molette (ou pinch trackpad) = ZOOM. Sinon = déplacement (pan) :
      // molette verticale → haut/bas, Shift ou molette latérale → gauche/droite.
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => Math.min(2, Math.max(0.15, z - e.deltaY * 0.0015)))
      } else {
        setOffset((o) => ({
          x: o.x - (e.shiftKey ? e.deltaY : e.deltaX),
          y: o.y - (e.shiftKey ? 0 : e.deltaY),
        }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function reset() { setOffset({ x: 0, y: 0 }); setZoom(1) }

  return (
    <div
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className={cn('relative overflow-hidden rounded-2xl border bg-muted/10 select-none', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
    >
      {/* Fond animé Particles, confiné au cadre du canvas (coins arrondis) */}
      <div className="pointer-events-none absolute inset-0">
        <Particles
          className=""
          particleColors={['#A6C8FF', '#5227FF', '#FF9FFC']}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles
          disableRotation={false}
        />
      </div>
      {/* Voile discret par-dessus le fond animé pour conserver la lisibilité */}
      <div className="pointer-events-none absolute inset-0 bg-background/40" />
      <div
        className="relative z-[1] h-full origin-top will-change-transform"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: grabbing ? 'none' : 'transform 0.1s ease-out' }}
      >
        {children}
      </div>

      {/* Contrôles zoom + recentrer */}
      <div
        className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border bg-card px-1 py-1 shadow-sm"
        title={t('automations.builder.canvas_hint')}
      >
        <button onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" title={t('automations.builder.zoom_out')}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" title={t('automations.builder.zoom_in')}>
          <Plus className="h-4 w-4" />
        </button>
        {(offset.x !== 0 || offset.y !== 0 || zoom !== 1) && (
          <button onClick={reset} className="ml-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title={t('automations.builder.recenter')}>
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

type TFn = (key: string, params?: Record<string, string | number>) => string

function templateSamples(tpl: WhatsAppTemplate | undefined, t: TFn): string[] {
  if (!tpl) return []
  const keys = (tpl.variable_keys as string[]) || []
  // Les samples « phrase » (statut de commande, bouton cliqué) portent une clé
  // i18n ; les données neutres (« Marie », « #1024 ») restent telles quelles.
  if (keys.length > 0) return keys.map((k) => { const v = VARIABLE_BY_KEY[k]; return v ? (v.sampleKey ? t(v.sampleKey) : v.sample) : 'exemple' })
  return (tpl.sample_values as string[]) || []
}

function delayLabelMin(m: number, t: TFn): string {
  if (m <= 0) return t('automations.builder.immediate')
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
  const parents: { from: string; branch?: string }[] = []
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
  graph, templates, storeName, onChange, automationId, kind = 'transactional', onTemplatesChanged,
}: {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  storeName: string
  onChange: (g: WorkflowGraph) => void
  automationId?: string | null
  /** Onglet d'appartenance : filtre les déclencheurs proposés. */
  kind?: 'marketing' | 'transactional'
  /** Rechargé après édition d'un modèle (ajout de boutons → resoumission Meta). */
  onTemplatesChanged?: () => void
}) {
  const { t, locale } = useTranslation()
  // Dernier modèle choisi → alimente l'aperçu téléphone.
  const [previewTplId, setPreviewTplId] = useState<string | null>(null)

  const onPatch = useCallback((id: string, patch: Partial<WorkflowNode>) => onChange(patchNodeGraph(graph, id, patch)), [graph, onChange])
  const onInsert = useCallback((afterId: string, kind: 'delay' | 'condition' | 'action' | 'ab_test', branch?: string) => onChange(insertAfter(graph, afterId, kind, branch)), [graph, onChange])
  const onDelete = useCallback((id: string) => {
    // ⚠️ Supprimer un nœud QUI SE RAMIFIE (message à boutons, condition, A/B) ne
    // peut pas tout garder : ses branches n'ont plus de porteur. `removeNode`
    // recoud une seule suite ; les autres deviennent inatteignables et sortent de
    // l'écran. On PRÉVIENT avant, plutôt que de laisser le marchand découvrir
    // qu'une branche a disparu — il croirait à un bug.
    const outs = graph.edges.filter((e) => e.from === id)
    const branched = outs.filter((e) => e.branch).length
    if (branched > 1) {
      const ok = window.confirm(t('automations.builder.delete_branching_confirm', { count: branched }))
      if (!ok) return
    }
    onChange(removeNode(graph, id))
  }, [graph, onChange])
  const onAddVariant = useCallback((nodeId: string) => onChange(addVariant(graph, nodeId)), [graph, onChange])
  const onRemoveVariant = useCallback((nodeId: string, key: string) => onChange(removeVariant(graph, nodeId, key)), [graph, onChange])
  // Déplace la suite d'une route vers une autre (« Code promo » ⇄ « Par défaut »).
  // Sans ça, le marchand qui s'était trompé de route devait tout refaire.
  const onMoveBranch = useCallback(
    (fromId: string, branchFrom: string, branchTo: string) => onChange(moveBranch(graph, fromId, branchFrom, branchTo)),
    [graph, onChange]
  )

  // Modèle à prévisualiser : le dernier sélectionné, sinon le 1er nœud action.
  const firstAction = graph.nodes.find((n) => n.type === 'action' && n.templateId)
  const previewId = previewTplId || (firstAction?.type === 'action' ? firstAction.templateId : null)
  // ⚠️ APERÇU DANS LA LANGUE DU MARCHAND — via le MÊME helper que la timeline.
  //
  // Un `templates.find(t => t.id === previewId)` brut renvoyait la ligne
  // RÉFÉRENCÉE PAR LE NŒUD, donc le français, même avec l'interface en anglais :
  // ce chemin de rendu (l'aperçu téléphone) contournait entièrement la
  // localisation appliquée dans timeline.tsx.
  //
  // Rappel : ceci ne change QUE l'aperçu. L'envoi réel choisit toujours la
  // variante selon la langue du CLIENT, pas celle du marchand.
  const previewTpl = localizedTemplate(templates, previewId, locale) || undefined

  // Contexte réel du chemin menant à ce message : événement déclencheur,
  // délai cumulé, et condition rencontrée (pour la bulle système du mockup).
  const previewActionNode = graph.nodes.find((n) => n.type === 'action' && n.templateId === previewId)
  const ctx = pathContext(graph, previewActionNode?.id)

  // Campagnes = même moteur de timeline, mais tourné à l'HORIZONTALE (flux qui
  // court de gauche à droite, façon Klaviyo). Transactionnel = timeline
  // verticale historique. La plomberie du funnel à boutons (send_wait_click,
  // reprise webhook) reste active dans les deux sens : dès qu'un message a des
  // boutons, la timeline affiche ses branches.
  const orientation = kind === 'marketing' ? 'horizontal' : 'vertical'

  return (
    <div className="grid h-full grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Timeline centrale (déplaçable au clic-glissé). En vertical on la borne
          en largeur pour qu'elle respire ; en horizontal elle s'étend à droite
          (le PannableTimeline gère le défilement). */}
      <PannableTimeline>
        <div className={orientation === 'horizontal' ? 'w-max min-w-full py-2' : 'mx-auto w-full max-w-2xl'}>
          <Timeline
            graph={graph}
            templates={dedupeByName(templates, locale)}
            onPatch={onPatch}
            onInsert={onInsert}
            onDelete={onDelete}
            onSelectAction={setPreviewTplId}
            onAddVariant={onAddVariant}
            onRemoveVariant={onRemoveVariant}
            onMoveBranch={onMoveBranch}
            automationId={automationId}
            kind={kind}
            orientation={orientation}
            onTemplatesChanged={onTemplatesChanged}
          />
        </div>
      </PannableTimeline>

      {/* iPhone d'aperçu (tout à droite), affiché à partir de xl seulement
          (sur écran moyen/petit, on laisse toute la place au workflow). */}
      <div className="hidden min-h-0 xl:flex xl:items-center xl:justify-center">
        {previewTpl ? (
          <PhonePreview
            storeName={storeName}
            eventLabel={TRIGGER_EVENTS.find((e) => e.value === ctx.eventValue)?.label || t('automations.builder.trigger')}
            conditionsText={ctx.condition}
            delayLabel={delayLabelMin(ctx.delayMin, t)}
            headerText={previewTpl.header_text || undefined}
            bodyText={previewTpl.body_text}
            footerText={previewTpl.footer_text || undefined}
            samples={templateSamples(previewTpl, t)}
            mediaType={previewTpl.header_type}
            scale={0.82}
            mascot
            graph={graph}
            templates={templates}
          />
        ) : (
          // Aperçu iPhone vide : le cadre du téléphone reste visible, avec un
          // message d'invitation à l'intérieur (plus visuel qu'un texte seul).
          <PhonePreview
            storeName={storeName}
            eventLabel={TRIGGER_EVENTS.find((e) => e.value === ctx.eventValue)?.label || t('automations.builder.trigger')}
            conditionsText={ctx.condition}
            delayLabel={delayLabelMin(ctx.delayMin, t)}
            bodyText={t('automations.builder.choose_template_for_preview')}
            samples={[]}
            scale={0.82}
            mascot
          />
        )}
      </div>
    </div>
  )
}
