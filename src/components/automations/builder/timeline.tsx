'use client'

import React, { useState, useEffect } from 'react'
import { Clock, GitBranch, MessageSquare, Plus, ShoppingBag, Trash2, FlaskConical, Users, CalendarClock, Search, X, Reply, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChevronDown } from 'lucide-react'
import { TRIGGER_EVENTS, TRIGGER_CAVEATS, triggersForKind, isRepeatableTrigger, isSelfFeedingTrigger, defaultRecurrenceFor } from '@/lib/automations/types'
import { templateBlockReason, isBuildableTemplate } from '@/lib/templates/status'

/** Fuseau détecté du navigateur, proposé par défaut. `scheduledAt` reste
 *  TOUJOURS un instant absolu (ISO UTC) : le fuseau ne sert qu'à saisir et à
 *  afficher. Changer de fuseau ne déplace donc jamais l'envoi par accident. */
const BROWSER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : 'UTC'

/** Fuseaux proposés (le fuseau du navigateur est ajouté s'il manque). */
const TZ_OPTIONS = [
  'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Lisbon',
  'America/New_York', 'America/Toronto', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Africa/Casablanca', 'Africa/Abidjan', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo',
  'Australia/Sydney', 'UTC',
]

/** Décalage d'un fuseau à un instant donné, en minutes ENTIÈRES (DST compris).
 *  ⚠️ On tronque l'instant à la minute : Intl ne rend pas les secondes, donc
 *  `Date.UTC(...)` les ignore alors que `at.getTime()` les contient — le
 *  décalage sortait en flottant (« UTC+1:59.2455… » au lieu de « UTC+2 »). */
function tzOffsetMinutes(tz: string, at: Date): number {
  const base = new Date(Math.floor(at.getTime() / 60000) * 60000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(base)
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  const asTz = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'))
  return Math.round((asTz - base.getTime()) / 60000)
}

/** Étiquette « UTC+2 », « UTC-5:30 »… pour un fuseau, maintenant. */
function tzOffsetLabel(tz: string): string {
  const min = tzOffsetMinutes(tz, new Date())
  const sign = min >= 0 ? '+' : '-'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** « 2026-07-09T17:00 » lu DANS `tz` → instant absolu (ISO UTC).
 *  Deux passes : la 1re estime le décalage, la 2de le corrige au voisinage
 *  d'un changement d'heure (DST). */
function zonedInputToIso(local: string, tz: string): string | undefined {
  if (!local) return undefined
  const [date, time] = local.split('T')
  const [Y, M, D] = date.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  const wanted = Date.UTC(Y, M - 1, D, h, m)
  let ts = wanted
  // 1re passe : décalage estimé à l'instant approché. 2de passe : le corrige si
  // l'approximation tombait de l'autre côté d'un changement d'heure (DST).
  for (let i = 0; i < 2; i++) ts = wanted - tzOffsetMinutes(tz, new Date(ts)) * 60000
  return new Date(ts).toISOString()
}

/** ISO (UTC) → valeur d'un <input type="datetime-local"> exprimée DANS `tz`.
 *  ⚠️ Ne jamais faire `iso.slice(0,16)` : on afficherait l'heure UTC dans un
 *  champ interprété comme locale — l'heure reculait à chaque réouverture. */
function isoToZonedInput(iso: string | undefined, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const shifted = new Date(d.getTime() + tzOffsetMinutes(tz, d) * 60000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`
}

/** ISO (UTC) → texte lisible dans le fuseau choisi. */
function formatInTz(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: tz })
}

/** Groupes de déclencheurs (ordre d'affichage + repère visuel). Les noms
 *  correspondent au champ `group` de TRIGGER_EVENTS. */
const TRIGGER_GROUPS = [
  { name: 'Commande', icon: ShoppingBag, color: 'text-blue-500' },
  { name: 'Contact', icon: Users, color: 'text-emerald-500' },
  { name: 'Conversation', icon: MessageSquare, color: 'text-violet-500' },
  { name: 'Planifié', icon: CalendarClock, color: 'text-amber-500' },
] as const
import { CONDITION_FIELDS, COUNTRY_OPTIONS, LANGUAGE_OPTIONS, OP_LABEL } from './field-labels'
import { chainFrom, getNode } from './timeline-model'
import { TemplateBubble } from '@/components/template-bubble'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import { USE_CASES, guessUseCase } from '@/lib/templates/use-cases'
import type { WorkflowGraph, WorkflowNode, TriggerRecurrence } from '@/lib/automations/graph-types'
import { buttonBranch, BUTTON_TIMEOUT_BRANCH } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate, TemplateButton } from '@/types/database'

/** Libellés des boutons QUICK_REPLY d'un message : ces libellés servent de
 *  points de départ de branche (`button:<texte>`). Le webhook capte exactement
 *  ce `text` au clic → la branche matche le runtime. */
function quickReplyLabels(t: WhatsAppTemplate | undefined | null): string[] {
  if (!t) return []
  return ((t.buttons ?? []) as TemplateButton[])
    .filter((b) => b.type === 'QUICK_REPLY')
    .map((b) => b.text)
}

const DELAY_PRESETS = [
  { v: 0, l: 'Immédiat' }, { v: 30, l: '30 min' }, { v: 60, l: '1 heure' },
  { v: 180, l: '3 heures' }, { v: 1440, l: '1 jour' }, { v: 2880, l: '2 jours' }, { v: 10080, l: '7 jours' },
]

// Produits / collections de la boutique (titres) — chargés une seule fois et
// partagés par tous les blocs condition (listes déroulantes des conditions).
const listCache: Record<string, { title: string }[]> = {}
const listPromise: Record<string, Promise<{ title: string }[]>> = {}
function useShopList(endpoint: string): { title: string }[] {
  const [items, setItems] = useState<{ title: string }[]>(listCache[endpoint] || [])
  useEffect(() => {
    if (listCache[endpoint]) return
    if (!listPromise[endpoint]) {
      listPromise[endpoint] = fetch(endpoint)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j): { title: string }[] => { const list = Array.isArray(j.data) ? j.data : []; listCache[endpoint] = list; return list })
        .catch((): { title: string }[] => { listCache[endpoint] = []; return [] })
    }
    listPromise[endpoint].then((p) => setItems(p))
  }, [endpoint])
  return items
}

/** Étapes/tags du cycle de vie de l'utilisateur (pour la condition has_stage). */
const stagesCache: { list?: { id: string; name: string; color: string }[] } = {}
let stagesPromise: Promise<{ id: string; name: string; color: string }[]> | null = null
function useLifecycleStageList(): { id: string; name: string; color: string }[] {
  const [items, setItems] = useState<{ id: string; name: string; color: string }[]>(stagesCache.list || [])
  useEffect(() => {
    if (stagesCache.list) return
    if (!stagesPromise) {
      stagesPromise = fetch('/api/lifecycle/stages')
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => {
          const list = (Array.isArray(j.data) ? j.data : []).map((s: { id: string; name: string; color?: string }) => ({ id: s.id, name: s.name, color: s.color || '#6366f1' }))
          stagesCache.list = list
          return list
        })
        .catch(() => { stagesCache.list = []; return [] })
    }
    stagesPromise.then((p) => setItems(p))
  }, [])
  return items
}

type InsertKind = 'delay' | 'condition' | 'action' | 'ab_test'

/**
 * Orientation du flux. `vertical` = timeline historique (transactionnel).
 * `horizontal` = même système, tourné 90° pour les campagnes (façon Klaviyo) :
 *  le flux principal (trigger → délai → message) court de GAUCHE à DROITE, et
 *  les branches (Oui/Non, A/B, boutons) s'empilent verticalement.
 * Passé par contexte pour ne pas threader le prop dans tous les blocs — seuls
 * les 4 composants « structurels » (Timeline, Branch, Inserter, BranchCol) le
 * consomment ; les blocs eux-mêmes sont identiques dans les deux sens.
 */
type Orientation = 'vertical' | 'horizontal'
const OrientationContext = React.createContext<Orientation>('vertical')
const useOrientation = () => React.useContext(OrientationContext)

type TimelineProps = {
  graph: WorkflowGraph
  templates: WhatsAppTemplate[]
  onPatch: (id: string, patch: Partial<WorkflowNode>) => void
  onInsert: (afterId: string, kind: InsertKind, branch?: string) => void
  onDelete: (id: string) => void
  onSelectAction: (templateId: string | null) => void
  onAddVariant?: (nodeId: string) => void
  onRemoveVariant?: (nodeId: string, key: string) => void
  automationId?: string | null
  /** Filtre les déclencheurs proposés (Campagnes vs Automatisations). */
  kind?: 'marketing' | 'transactional'
  /** Sens du flux. `horizontal` pour les campagnes (canvas façon Klaviyo). */
  orientation?: Orientation
  /** Appelé après édition d'un modèle (ajout de boutons → resoumission Meta). */
  onTemplatesChanged?: () => void
}

/**
 * Timeline verticale fixe (style Loops.so). Blocs colorés "remplis" avec leur
 * contenu éditable directement dedans (selects). Boutons "+" entre les blocs.
 * Les conditions se séparent en deux colonnes Oui / Non, puis se referment.
 */
export function Timeline(props: TimelineProps) {
  const trigger = props.graph.nodes.find((n) => n.type === 'trigger')
  if (!trigger) return null
  const orientation = props.orientation ?? 'vertical'
  const horizontal = orientation === 'horizontal'

  return (
    <OrientationContext.Provider value={orientation}>
      <div className={cn(
        'flex py-2',
        horizontal ? 'flex-row items-center gap-0' : 'flex-col items-center',
      )}>
        <TriggerBlock node={trigger} onPatch={props.onPatch} kind={props.kind ?? 'transactional'} />
        <Branch {...props} fromId={trigger.id} />
      </div>
    </OrientationContext.Provider>
  )
}

// Couleurs des colonnes de variantes A/B/C/D.
const VARIANT_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899']
// Couleurs des sorties de boutons quick-reply (vert WhatsApp puis autres teintes).
const BUTTON_COLORS = ['#25D366', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6']

function Branch(props: TimelineProps & { fromId: string; branch?: string }) {
  const { graph, fromId, branch, templates, onPatch, onInsert, onDelete, onSelectAction, onTemplatesChanged } = props
  const chain = chainFrom(graph, fromId, branch)
  const horizontal = useOrientation() === 'horizontal'
  // Rangée qui porte les sous-branches (Oui/Non, A/B) : côte à côte en vertical
  // (colonnes), empilées en horizontal (chaque branche repart vers la droite).
  const branchesRow = horizontal
    ? 'mt-0 ml-1 flex flex-col items-start gap-4'
    : 'mt-1 flex w-full items-start justify-center gap-6'
  const abBranchesRow = horizontal
    ? 'mt-0 ml-1 flex flex-col items-start gap-4'
    : 'mt-1 flex w-full items-start justify-center gap-4'
  return (
    <div className={cn('flex', horizontal ? 'flex-row items-center' : 'flex-col items-center')}>
      <Inserter onInsert={(kind) => onInsert(fromId, kind, branch)} />
      {chain.map((id, i) => {
        const node = getNode(graph, id)
        if (!node) return null

        if (node.type === 'delay') return (
          <React.Fragment key={id}>
            <DelayBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)} />
            <Inserter onInsert={(kind) => onInsert(id, kind)} />
          </React.Fragment>
        )

        if (node.type === 'action') {
          // Un message à boutons quick-reply se comporte comme une condition :
          // chaque bouton ouvre SA propre branche (`button:<texte>`). L'utilisateur
          // tire une suite différente derrière « Oui » et derrière « Non ».
          const tpl = templates.find((t) => t.id === node.templateId)
          const buttons = quickReplyLabels(tpl)
          if (buttons.length > 0) return (
            <React.Fragment key={id}>
              <ActionBlock node={node} templates={templates} onPatch={onPatch} onDelete={() => onDelete(id)} onSelectAction={onSelectAction} onTemplatesChanged={onTemplatesChanged} />
              <div className={branchesRow}>
                {buttons.map((text, bi) => (
                  <BranchCol key={text} label={text} color={BUTTON_COLORS[bi % BUTTON_COLORS.length]}>
                    <Branch {...props} fromId={id} branch={buttonBranch(text)} />
                  </BranchCol>
                ))}
                {/* Suite PAR DÉFAUT : la continuité normale du parcours. Elle part
                    IMMÉDIATEMENT après le message à boutons (ex. message suivant /
                    carrousel), que le contact clique ou non. Les boutons ci-dessus
                    déclenchent leurs branches EN PLUS si on clique. */}
                <BranchCol label="Par défaut" color="#94A3B8">
                  <Branch {...props} fromId={id} branch={BUTTON_TIMEOUT_BRANCH} />
                </BranchCol>
              </div>
            </React.Fragment>
          )
          return (
            <React.Fragment key={id}>
              <ActionBlock node={node} templates={templates} onPatch={onPatch} onDelete={() => onDelete(id)} onSelectAction={onSelectAction} onTemplatesChanged={onTemplatesChanged} />
              {i === chain.length - 1 && <Inserter onInsert={(kind) => onInsert(id, kind)} />}
            </React.Fragment>
          )
        }

        if (node.type === 'condition') return (
          <React.Fragment key={id}>
            <ConditionBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)} />
            <div className={branchesRow}>
              <BranchCol label="Oui" color="#22C55E">
                <Branch {...props} fromId={id} branch="yes" />
              </BranchCol>
              <BranchCol label="Non" color="#EF4444">
                <Branch {...props} fromId={id} branch="no" />
              </BranchCol>
            </div>
          </React.Fragment>
        )

        if (node.type === 'ab_test') return (
          <React.Fragment key={id}>
            <ABTestBlock node={node} onPatch={onPatch} onDelete={() => onDelete(id)}
              onAddVariant={props.onAddVariant} onRemoveVariant={props.onRemoveVariant}
              automationId={props.automationId}
              abNumber={graph.nodes.filter((n) => n.type === 'ab_test').findIndex((n) => n.id === id) + 1} />
            <div className={abBranchesRow}>
              {node.variants.map((v, vi) => (
                <BranchCol key={v.key} label={`${v.key} · ${v.weight}%`} color={VARIANT_COLORS[vi % 4]}>
                  <Branch {...props} fromId={id} branch={`variant:${v.key}`} />
                </BranchCol>
              ))}
            </div>
          </React.Fragment>
        )
        return null
      })}
    </div>
  )
}

// ---- Blocs colorés "remplis" (style de l'ancien éditeur) --------------------

function Shell({ tone, icon, kind, onDelete, children }: {
  tone: { text: string; tint: string }
  icon: React.ReactNode; kind: string; onDelete?: () => void; children: React.ReactNode
}) {
  return (
    <>
      <Connector />
      <div data-block className="liquid-glass group relative w-72 rounded-2xl p-3" style={{ ['--lg-tint' as string]: tone.tint }}>
        <div className="mb-2 flex items-center gap-1.5">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-current/10', tone.text)}>{icon}</span>
          <span className={cn('text-sm font-medium', tone.text)}>{kind}</span>
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} title="Supprimer ce bloc"
              className="ml-auto rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </>
  )
}

/** Un ton par TYPE de bloc : deux blocs de la timeline ne doivent jamais
 *  partager la même couleur, sinon on ne les distingue plus d'un coup d'œil.
 *  blue = Quand (déclencheur) · amber = Délai · green = Message
 *  violet = Condition · pink = Test A/B */
const TONE = {
  blue: { text: 'text-blue-600', tint: '#3B82F6' },
  amber: { text: 'text-amber-600', tint: '#F59E0B' },
  green: { text: 'text-green-600', tint: '#22C55E' },
  violet: { text: 'text-violet-600', tint: '#8B5CF6' },
  pink: { text: 'text-pink-600', tint: '#EC4899' },
}

function TriggerBlock({ node, onPatch, kind }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; kind: 'marketing' | 'transactional' }) {
  if (node.type !== 'trigger') return null
  // Déclencheurs autorisés dans cet onglet.
  const allowed = new Set(triggersForKind(kind).map((e) => e.value))
  return (
    <div data-block className="liquid-glass relative w-72 rounded-2xl p-3" style={{ ['--lg-tint' as string]: TONE.blue.tint }}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-current/10', TONE.blue.text)}><ShoppingBag className="h-4 w-4" /></span>
        <span className={cn('text-sm font-medium', TONE.blue.text)}>Quand</span>
      </div>
      <Select value={node.event} onValueChange={(v) => onPatch(node.id, { event: v as never })}>
        {/* Le trigger n'affiche QUE le libellé : Radix recopie sinon tout le
            contenu du SelectItem (libellé + description), et la description se
            retrouvait affichée deux fois, dans le champ et juste en dessous. */}
        <SelectTrigger>
          <SelectValue>
            {TRIGGER_EVENTS.find((e) => e.value === node.event)?.label ?? 'Choisir un déclencheur'}
          </SelectValue>
        </SelectTrigger>
        {/* max-h borné : sans lui Radix étire le menu sur toute la hauteur
            disponible, le menu n'a donc rien à faire défiler et la molette
            scrolle la page derrière. Groupes + icônes + descriptions : 15
            déclencheurs à plat étaient illisibles. */}
        <SelectContent className="max-h-[min(24rem,60vh)] w-[19rem]">
          {TRIGGER_GROUPS.map((g, gi) => {
            const items = TRIGGER_EVENTS.filter((e) => e.group === g.name && allowed.has(e.value))
            if (items.length === 0) return null
            const Icon = g.icon
            return (
              <SelectGroup key={g.name}>
                {gi > 0 && <SelectSeparator />}
                <SelectLabel className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Icon className={cn('h-3.5 w-3.5', g.color)} /> {g.name}
                </SelectLabel>
                {items.map((e) => (
                  <SelectItem key={e.value} value={e.value} textValue={e.label} className="items-start py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm leading-tight">{e.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{e.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">{TRIGGER_EVENTS.find((e) => e.value === node.event)?.description}</p>

      {/* Mise en garde : cet événement ne dépend pas de nous et peut ne jamais
          arriver (transporteur muet, commande jamais encaissée). Sans elle, le
          marchand ne voit rien partir et conclut à un bug de Xeyo. */}
      {TRIGGER_CAVEATS[node.event] && (
        <p className="mt-1.5 flex gap-1.5 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-600">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{TRIGGER_CAVEATS[node.event]}</span>
        </p>
      )}

      {/* Paramètres spécifiques aux triggers temporels */}
      {node.event === 'no_customer_reply' && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Sans réponse depuis</p>
          <Select value={String(node.inactivityHours ?? 24)} onValueChange={(v) => onPatch(node.id, { inactivityHours: parseInt(v, 10) } as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 heure</SelectItem>
              <SelectItem value="3">3 heures</SelectItem>
              <SelectItem value="12">12 heures</SelectItem>
              <SelectItem value="24">1 jour</SelectItem>
              <SelectItem value="48">2 jours</SelectItem>
              <SelectItem value="72">3 jours</SelectItem>
              <SelectItem value="168">7 jours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {node.event === 'scheduled_date' && (() => {
        // Fuseau de saisie : celui enregistré dans le nœud, sinon celui du
        // navigateur. Le changer ne déplace PAS l'envoi (scheduledAt est absolu) :
        // la même date s'affiche simplement dans l'autre fuseau.
        const tz = node.scheduledTz || BROWSER_TZ
        const options = TZ_OPTIONS.includes(tz) ? TZ_OPTIONS : [tz, ...TZ_OPTIONS]
        return (
        <div className="mt-2">
          {/* Le fuseau est AU-DESSUS du champ : le calendrier natif s'ouvre
              par-dessous et masquerait une mention placée sous l'input, au
              moment précis où l'on choisit l'heure. */}
          <p className="mb-1 text-xs text-muted-foreground">Date et heure d’envoi</p>
          <Input type="datetime-local"
            value={isoToZonedInput(node.scheduledAt, tz)}
            onChange={(e) => onPatch(node.id, {
              scheduledAt: zonedInputToIso(e.target.value, tz),
              scheduledTz: tz,
            } as never)} />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">Fuseau</span>
            <Select value={tz} onValueChange={(v) => onPatch(node.id, { scheduledTz: v } as never)}>
              {/* Libellé compact : sans enfant explicite, Radix recopierait tout
                  le contenu de l'item (nom + décalage) dans le champ. */}
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue>{tz} ({tzOffsetLabel(tz)})</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[min(18rem,50vh)]">
                {options.map((z) => (
                  <SelectItem key={z} value={z} textValue={z} className="text-xs">
                    {z} <span className="text-muted-foreground">({tzOffsetLabel(z)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {node.scheduledAt && (
            <p className="mt-1 text-[11px] text-muted-foreground">Envoi le {formatInTz(node.scheduledAt, tz)}</p>
          )}
        </div>
        )
      })()}
      {node.event === 'customer_birthday' && (
        <p className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
          Envoyé le jour de l’anniversaire (si la date est connue dans la fiche du client).
        </p>
      )}
      {node.event === 'button_clicked' && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Libellé du bouton (laisser vide = tout bouton)</p>
          <Input
            placeholder="Ex : Suivre ma commande"
            value={node.buttonText ?? ''}
            onChange={(e) => onPatch(node.id, { buttonText: e.target.value } as never)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se déclenche quand le client clique sur un bouton « réponse rapide » portant ce texte.
          </p>
        </div>
      )}

      {/* ── Récurrence ──
          Uniquement pour les déclencheurs qu'un même contact peut refranchir.
          Une commande n'est payée qu'une fois : le réglage n'aurait aucun effet,
          et l'afficher laisserait croire le contraire. */}
      {isRepeatableTrigger(node.event) && (() => {
        // Le défaut dépend du déclencheur (panier abandonné = à chaque panier) :
        // afficher « une seule fois » partout mentirait sur le comportement réel.
        const recurrence = node.recurrence ?? defaultRecurrenceFor(node.event)
        const selfFeeding = isSelfFeedingTrigger(node.event)
        // Le vocabulaire suit le déclencheur : « à chaque fois » ne dit rien,
        // « à chaque panier » se comprend sans réfléchir.
        const perEventLabel = node.event === 'checkout_abandoned' ? 'À chaque panier abandonné'
          : node.event === 'no_customer_reply' ? 'À chaque silence'
          : 'À chaque fois'
        return (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1 text-xs text-muted-foreground">Combien de fois par client</p>
            <Select
              value={recurrence}
              onValueChange={(v) => onPatch(node.id, { recurrence: v as TriggerRecurrence } as never)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Une seule fois</SelectItem>
                <SelectItem value="per_event">{perEventLabel}</SelectItem>
                <SelectItem value="daily">Au plus une fois par jour</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {recurrence === 'once' && (
                node.event === 'checkout_abandoned'
                  ? 'Chaque client n’est relancé que pour son premier panier abandonné, jamais pour les suivants.'
                  : 'Chaque client ne reçoit ce message qu’une fois, définitivement.'
              )}
              {recurrence === 'per_event' && (
                node.event === 'no_customer_reply'
                  ? 'Une relance par silence : le client redevient relançable seulement s’il répond puis se tait à nouveau.'
                  : node.event === 'checkout_abandoned'
                    ? 'Une relance par panier abandonné, quel que soit le nombre de paniers du client.'
                    : 'Le message repart à chaque nouvel événement.'
              )}
              {recurrence === 'daily' && 'Au maximum un message par jour et par client.'}
            </p>
            {/* ⚠️ Ces deux déclencheurs se nourrissent de nos propres envois :
                on envoie → le client lit (ou continue de se taire) → ça
                redéclenche. Les deux ont réellement bouclé en production. Le
                marchand peut choisir la récurrence, mais pas sans le savoir. */}
            {selfFeeding && recurrence !== 'once' && (
              <p className="mt-1.5 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-600">
                {node.event === 'message_read'
                  ? 'Attention : votre message sera lui aussi lu, ce qui peut redéclencher l’envoi. Vérifiez que la suite du scénario s’arrête bien.'
                  : 'Attention : tant que le client ne répond pas, la condition reste vraie. Vérifiez que la suite du scénario s’arrête bien.'}
              </p>
            )}
            {/* Sur un panier abandonné, « une seule fois » est contre-intuitif et
                coûte des ventes : le client ne sera plus jamais relancé, même
                pour un panier à 500 €. On le dit avant qu'il ne le découvre. */}
            {node.event === 'checkout_abandoned' && recurrence === 'once' && (
              <p className="mt-1.5 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-600">
                Attention : un client déjà relancé une fois ne le sera plus jamais, même pour un panier bien plus important. « À chaque panier abandonné » est le réglage habituel.
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function DelayBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  if (node.type !== 'delay') return null

  // ⚠️ LE BLOC « ATTENDRE » S'AFFICHAIT VIDE.
  //
  // Un Select ne peut afficher qu'une valeur présente dans ses options. Or les
  // délais ne viennent pas tous d'ici : l'IA en génère (le schéma lui donne même
  // « 4320 = 3 jours » en exemple… qui n'était PAS un preset), et une
  // automatisation importée peut porter n'importe quelle valeur. Résultat : le
  // marchand voyait « Attendre » sans durée, croyait le délai perdu, et le
  // parcours semblait cassé alors que la valeur était bien là.
  //
  // On ajoute donc à la volée l'option correspondant à la valeur courante quand
  // elle ne fait pas partie des presets : le Select affiche TOUJOURS ce qu'il
  // contient, quelle que soit sa provenance.
  const options = DELAY_PRESETS.some((d) => d.v === node.minutes)
    ? DELAY_PRESETS
    : [...DELAY_PRESETS, { v: node.minutes, l: humanDelay(node.minutes) }].sort((a, b) => a.v - b.v)

  return (
    <Shell tone={TONE.amber} icon={<Clock className="h-4 w-4" />} kind="Attendre" onDelete={onDelete}>
      <Select value={String(node.minutes)} onValueChange={(v) => onPatch(node.id, { minutes: parseInt(v, 10) } as never)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
      </Select>
    </Shell>
  )
}

/** Durée en minutes → libellé lisible (« 3 jours », « 12 heures »). */
function humanDelay(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Immédiat'
  if (minutes < 60) return `${minutes} min`
  if (minutes % 1440 === 0) { const d = minutes / 1440; return `${d} jour${d > 1 ? 's' : ''}` }
  if (minutes % 60 === 0) { const h = minutes / 60; return `${h} heure${h > 1 ? 's' : ''}` }
  return `${Math.round(minutes / 60)} h`
}

/**
 * Éditeur de boutons quick-reply DANS le bloc « Envoyer le modèle ».
 * Évite les allers-retours Modèles ⇄ Automatisations : on ajoute/retire les
 * boutons ici, puis « Enregistrer » édite le template (PATCH) et le RESOUMET à
 * Meta (POST /submit). Le template repasse « en revue » le temps de l'approbation
 * (badge affiché par ActionBlock). Réutilise les routes existantes — aucun
 * nouveau moteur. Boutons quick-reply uniquement (le funnel Oui/Non).
 */
function TemplateButtonsEditor({ template, onSaved }: {
  template: WhatsAppTemplate
  onSaved?: () => void
}) {
  // On n'édite QUE les boutons quick-reply. Les éventuels boutons URL/PHONE/
  // COPY_CODE du template sont conservés tels quels à la sauvegarde.
  const initial = ((template.buttons ?? []) as TemplateButton[])
    .filter((b) => b.type === 'QUICK_REPLY')
    .map((b) => b.text)
  const [labels, setLabels] = useState<string[]>(initial)
  const [open, setOpen] = useState(false)   // replié par défaut : l'aperçu montre déjà les boutons
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const otherButtons = ((template.buttons ?? []) as TemplateButton[]).filter((b) => b.type !== 'QUICK_REPLY')
  // UTILITY : susceptible d'être requalifié MARKETING par Meta si on y ajoute
  // des boutons quick-reply → on prévient l'utilisateur (cf. avertissement).
  const isUtility = ((template as { category?: string }).category || '').toUpperCase() === 'UTILITY'

  const dirty = JSON.stringify(labels) !== JSON.stringify(initial)
  // Meta plafonne à 3 boutons quick-reply, et pas de mélange QR + autres types.
  const maxQr = otherButtons.length > 0 ? 0 : 3
  const canAdd = labels.length < maxQr

  const setAt = (i: number, v: string) => setLabels((l) => l.map((x, j) => (j === i ? v : x)))
  const removeAt = (i: number) => setLabels((l) => l.filter((_, j) => j !== i))
  const add = () => setLabels((l) => [...l, ''])

  async function save() {
    const clean = labels.map((s) => s.trim()).filter(Boolean)
    if (clean.some((s) => s.length > 25)) { setError('Un bouton fait 25 caractères max.'); return }
    if (new Set(clean.map((s) => s.toLowerCase())).size !== clean.length) { setError('Deux boutons ne peuvent pas avoir le même texte.'); return }
    setSaving(true); setError(null)
    try {
      const nextButtons = [...otherButtons, ...clean.map((text): TemplateButton => ({ type: 'QUICK_REPLY', text }))]
      // 1) PATCH le contenu du modèle (garde le meta_id, passe has_pending_changes).
      const patch = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buttons: nextButtons }),
      })
      if (!patch.ok) { setError((await patch.json().catch(() => ({}))).error || 'Échec de l’enregistrement.'); return }
      // 2) RESOUMET à Meta pour re-validation (le modèle repasse « en revue »).
      const submit = await fetch(`/api/templates/${template.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!submit.ok) {
        const j = await submit.json().catch(() => ({}))
        setError(j.error || 'Modèle enregistré, mais la soumission à Meta a échoué.')
        // Le PATCH a réussi : on rafraîchit quand même pour refléter l'état.
        onSaved?.()
        return
      }
      onSaved?.()
    } catch {
      setError('Erreur réseau.')
    } finally {
      setSaving(false)
    }
  }

  const count = labels.filter((s) => s.trim()).length
  return (
    <div className="rounded-lg border border-dashed border-border/70 p-2">
      {/* En-tête repliable : l'aperçu au-dessus montre déjà les boutons, on ne
          déplie l'éditeur que pour les modifier (évite l'impression de doublon). */}
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Reply className="h-3 w-3" />
        <span>Boutons de réponse rapide{count > 0 ? ` (${count})` : ''}</span>
        {dirty && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">non enregistré</span>}
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {!open ? null : (
      <div className="mt-2">
      {otherButtons.length > 0 && (
        <p className="mb-1.5 text-[10px] text-amber-600">
          Ce modèle a déjà des boutons {otherButtons.map((b) => b.type).join(', ')} : impossible d’y ajouter des réponses rapides (règle Meta).
        </p>
      )}
      {/* Reclassement : ajouter des réponses rapides à un modèle UTILITY peut
          pousser Meta à le requalifier en MARKETING (tarif + règles d'envoi
          différents). On prévient avant, seulement si on ajoute vraiment des boutons. */}
      {isUtility && dirty && labels.some((l) => l.trim()) && (
        <p className="mb-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-600">
          ⚠️ Ajouter des boutons peut faire reclasser ce modèle <b>Utilitaire → Marketing</b> par Meta (tarif et règles d’envoi différents).
        </p>
      )}
      <div className="space-y-1.5">
        {labels.map((text, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={text}
              maxLength={25}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={`Bouton ${i + 1} (ex. Oui)`}
              className="h-8 text-xs"
            />
            <button type="button" onClick={() => removeAt(i)} title="Retirer ce bouton"
              className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {canAdd && (
        <button type="button" onClick={add}
          className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10">
          <Plus className="h-3.5 w-3.5" /> Ajouter un bouton
        </button>
      )}
      {error && <p className="mt-1.5 text-[10px] text-destructive">{error}</p>}
      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving ? 'Envoi à Meta…' : 'Enregistrer les boutons'}
          </button>
          <button type="button" onClick={() => { setLabels(initial); setError(null) }} disabled={saving}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60">
            Annuler
          </button>
        </div>
      )}
      {dirty && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          ⏳ Enregistrer renvoie le modèle en revue Meta (~quelques minutes). Il ne pourra être envoyé qu’une fois approuvé.
        </p>
      )}
      </div>
      )}
    </div>
  )
}

function ActionBlock({ node, templates, onPatch, onDelete, onSelectAction, onTemplatesChanged }: {
  node: WorkflowNode; templates: WhatsAppTemplate[]
  onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void; onSelectAction: (t: string | null) => void
  onTemplatesChanged?: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCat, setPickerCat] = useState<string>('all')
  // Recherche libre : nom, texte du message, langue. Indispensable dès qu'un
  // même modèle existe en plusieurs langues (panier_abandonne fr + en…).
  const [pickerQuery, setPickerQuery] = useState('')
  if (node.type !== 'action') return null
  const selected = templates.find((t) => t.id === node.templateId) || null
  const badge = (t: WhatsAppTemplate) =>
    t.template_type === 'carousel' ? '🎠 Carrousel'
    : t.template_type === 'limited_time_offer' ? '🏷️ Offre limitée'
    : '💬 Message'
  const labelsFor = (t: WhatsAppTemplate) => (t.variable_keys || []).map((k) => VARIABLE_BY_KEY[k]?.label || k)

  return (
    <Shell tone={TONE.green} icon={<MessageSquare className="h-4 w-4" />} kind="Envoyer le modèle" onDelete={onDelete}>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun modèle approuvé.</p>
      ) : (
        <div className="space-y-2">
          {/* Sélecteur VISUEL : ouvre une galerie de bulles de message. */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-foreground/30">
                <span className={cn('truncate', selected ? 'font-medium' : 'text-muted-foreground')}>
                  {selected ? selected.name : 'Choisir un modèle'}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[540px] max-w-[92vw] overscroll-contain p-2"
              onWheel={(e) => e.stopPropagation()}
            >
              <p className="px-1 pb-2 pt-1 text-[11px] font-medium text-muted-foreground">Choisir un modèle</p>

              {/* Recherche (nom, texte, langue) */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Rechercher un modèle (nom, texte, langue)…"
                  className="h-8 w-full rounded-lg border border-input bg-background pl-7 pr-7 text-xs outline-none focus:border-primary"
                />
                {pickerQuery && (
                  <button type="button" onClick={() => setPickerQuery('')} title="Effacer"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filtre par type de modèle (puces + compteurs). Libellés issus de
                  USE_CASES, la même source que la page Modèles : pas de doublon. */}
              {(() => {
                // `use_case` est NULL sur les modèles importés de Meta : on le
                // DÉDUIT du nom (comme la page Modèles), sinon aucune puce de
                // catégorie ne s'afficherait jamais.
                // Nom sans préfixe « use » : ESLint le prendrait pour un hook.
                const catOf = (t: WhatsAppTemplate) =>
                  (t as { use_case?: string }).use_case
                  || guessUseCase(t.name, (t as { category?: string }).category)
                const countIn = (key: string) =>
                  key === 'all' ? templates.length : templates.filter((t) => catOf(t) === key).length
                const cats = [
                  { key: 'all', label: 'Tous' },
                  // On n'affiche que les catégories qui ont au moins un modèle.
                  ...USE_CASES.filter((u) => countIn(u.key) > 0).map((u) => ({ key: u.key as string, label: u.label })),
                ]
                return (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {cats.map((c) => (
                      <button key={c.key} onClick={() => setPickerCat(c.key)}
                        className={cn('rounded-full px-2.5 py-1 text-[11px] transition-colors',
                          pickerCat === c.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                        {c.label} ({countIn(c.key)})
                      </button>
                    ))}
                  </div>
                )
              })()}

              {(() => {
                const q = pickerQuery.trim().toLowerCase()
                // Même règle que les puces : use_case s'il existe, sinon déduit.
                const catOfT = (t: WhatsAppTemplate) =>
                  (t as { use_case?: string }).use_case
                  || guessUseCase(t.name, (t as { category?: string }).category)
                const shown = templates
                  // La galerie propose aussi les BROUILLONS et les modèles EN
                  // REVUE, pas seulement les approuvés.
                  //
                  // Sinon un message tout juste créé (par l'assistant IA, ou à la
                  // main) est introuvable ici : il faudrait attendre ~24 h
                  // d'approbation Meta avant même de pouvoir dessiner son
                  // parcours. On laisse donc CONSTRUIRE ; l'activation, elle,
                  // reste bloquée tant que Meta n'a pas approuvé — et chaque nœud
                  // concerné le dit (cf. templateBlockReason).
                  .filter(isBuildableTemplate)
                  .filter((t) => pickerCat === 'all' || catOfT(t) === pickerCat)
                  .filter((t) => !q || [t.name, t.body_text, t.header_text, t.language]
                    .filter(Boolean).join(' ').toLowerCase().includes(q))
                if (shown.length === 0) {
                  return (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Aucun modèle ne correspond{q ? ` à « ${pickerQuery.trim()} »` : ''}.
                    </p>
                  )
                }
                return (
                <>
                <p className="mb-1 px-1 text-[10px] text-muted-foreground">{shown.length} modèle{shown.length > 1 ? 's' : ''}</p>
                {/* Bulles en défilement HORIZONTAL (le scroll reste dans la galerie). */}
                <div
                  className="flex gap-2 overflow-x-auto overscroll-contain pb-1 [scrollbar-width:thin]"
                  onWheel={(e) => {
                    // Convertit le scroll vertical de la molette en scroll horizontal.
                    if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; e.stopPropagation() }
                  }}
                >
                {shown
                  .map((t) => {
                    const isSel = t.id === node.templateId
                    return (
                      <button
                        key={t.id}
                        onClick={() => { onPatch(node.id, { templateId: t.id } as never); onSelectAction(t.id); setPickerOpen(false) }}
                        className={cn(
                          'w-[230px] shrink-0 rounded-xl border p-2.5 text-left transition-colors',
                          isSel ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-foreground/30 hover:bg-muted/40'
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
                          {t.language && (
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">{t.language}</span>
                          )}
                          <span className="shrink-0 text-[10px] text-muted-foreground">{badge(t)}</span>
                        </div>
                        {/* Statut VISIBLE dans la galerie : maintenant qu'on y
                            propose des brouillons, il faut le savoir AVANT de
                            choisir — pas en découvrant que le parcours refuse
                            de s'activer. */}
                        <div className="mb-1"><TemplateStatusBadge template={t} /></div>
                        {/* Aperçu grand : on voit le message en entier (scroll interne
                            si vraiment très long). */}
                        <div className="max-h-[360px] overflow-y-auto [scrollbar-width:thin]">
                          <TemplateBubble template={t} labels={labelsFor(t)} />
                        </div>
                      </button>
                    )
                  })}
                </div>
                </>
                )
              })()}
            </PopoverContent>
          </Popover>

          {/* Aperçu du modèle sélectionné directement dans le nœud. */}
          {selected && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                {badge(selected)}
                <TemplateStatusBadge template={selected} />
              </div>
              <TemplateBubble template={selected} labels={labelsFor(selected)} />

              {/* ⚠️ Le blocage se dit SUR LE NŒUD fautif, pas seulement au
                  moment d'activer. Meta n'envoie que des modèles approuvés
                  (dispatch filtre là-dessus) : sans ce bandeau, le parcours
                  semblait prêt, refusait de s'activer, et rien n'indiquait
                  LEQUEL des messages posait problème. */}
              {templateBlockReason(selected.status) && (
                <p className="mt-1.5 flex items-start gap-1 rounded-md bg-amber-500/10 p-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  <span>{templateBlockReason(selected.status)}</span>
                </p>
              )}
            </div>
          )}

          {/* Éditeur de boutons quick-reply, directement dans le bloc : ajoute le
              funnel Oui/Non sans quitter l'automatisation (resoumission Meta). */}
          {selected && selected.template_type !== 'carousel' && (
            <TemplateButtonsEditor key={selected.id} template={selected} onSaved={onTemplatesChanged} />
          )}

          {/* Réglage MULTI-ROUTE : visible seulement si le modèle a des boutons
              quick-reply. Permet au contact de suivre plusieurs réponses. */}
          {quickReplyLabels(selected).length > 0 && (
            <MultiRouteToggle
              // allowMultiple par défaut à TRUE (meilleure UX) si non défini.
              value={(node as { allowMultiple?: boolean }).allowMultiple !== false}
              onChange={(v) => onPatch(node.id, { allowMultiple: v } as never)}
            />
          )}
        </div>
      )}
    </Shell>
  )
}

/** Interrupteur « le client peut suivre plusieurs réponses » sur un message à
 *  boutons. ON = chaque bouton mène à sa branche (chacun une fois). OFF = une
 *  seule route (le 1er clic ferme le funnel). */
function MultiRouteToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-left transition-colors hover:border-foreground/30"
    >
      <span className={cn(
        'relative h-4 w-7 shrink-0 rounded-full transition-colors',
        value ? 'bg-primary' : 'bg-muted-foreground/30',
      )}>
        <span className={cn(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
          value ? 'left-3.5' : 'left-0.5',
        )} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium">Plusieurs réponses possibles</span>
        <span className="block text-[10px] leading-tight text-muted-foreground">
          {value
            ? 'Le client peut cliquer plusieurs boutons et recevoir chaque suite (une fois chacun).'
            : 'Le client ne suit qu’une seule réponse (le 1er clic termine le parcours).'}
        </span>
      </span>
    </button>
  )
}

/** Pastille de statut Meta d'un modèle : rien si approuvé et à jour, sinon un
 *  repère « en revue » / « refusé » pour que le merchant sache qu'il n'est pas
 *  (encore) envoyable. */
function TemplateStatusBadge({ template }: { template: WhatsAppTemplate }) {
  const t = template as WhatsAppTemplate & { has_pending_changes?: boolean; status?: string }
  // Brouillon : jamais soumis à Meta. Distinct de « en revue » — ici le marchand
  // doit AGIR (soumettre), là il n'a qu'à attendre. Sans ce badge, un parcours
  // bâti sur un brouillon paraissait prêt et refusait de s'activer sans dire
  // lequel des messages posait problème.
  if (t.status === 'draft') {
    return <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">Brouillon</span>
  }
  if (t.status === 'pending') {
    return <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">⏳ En revue</span>
  }
  if (t.status === 'rejected') {
    return <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">Refusé</span>
  }
  if (t.has_pending_changes) {
    return <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">Modifs non soumises</span>
  }
  return null
}

function ConditionBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  const products = useShopList('/api/shopify/products')
  const collections = useShopList('/api/shopify/collections')
  const lifecycleStages = useLifecycleStageList()
  if (node.type !== 'condition') return null
  const rule = node.rule
  const nodeId = node.id
  const field = CONDITION_FIELDS.find((f) => f.value === rule.field) || CONDITION_FIELDS[0]
  const setValue = (value: string | number | boolean | string[]) => onPatch(nodeId, { rule: { ...rule, value } } as never)

  // Choix de l'éditeur de VALEUR selon la source du champ.
  function valueEditor() {
    if (field.source === 'stage') {
      // Multi-sélection de tags : on stocke un tableau d'id d'étapes. Chaque tag
      // se toggle. La condition (has_any / has_none) est portée par l'opérateur.
      const selected = Array.isArray(rule.value) ? rule.value.map(String) : (rule.value ? [String(rule.value)] : [])
      const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
        setValue(next)
      }
      if (lifecycleStages.length === 0) {
        return <span className="flex-1 text-[11px] text-muted-foreground">Aucune étape définie. Créez-en dans « Gérer les étapes ».</span>
      }
      return (
        <div className="flex flex-1 flex-wrap gap-1">
          {lifecycleStages.map((s) => {
            const on = selected.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  on ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground'
                )}
                style={on ? { backgroundColor: s.color } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? '#fff' : s.color }} />
                {s.name}
              </button>
            )
          })}
        </div>
      )
    }
    if (field.valueType === 'boolean') {
      return (
        <Select value={String(rule.value)} onValueChange={(v) => setValue(v === 'true')}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent>
        </Select>
      )
    }
    if (field.source === 'country' || field.source === 'language') {
      const options = field.source === 'country' ? COUNTRY_OPTIONS : LANGUAGE_OPTIONS
      return (
        <Select value={String(rule.value ?? '')} onValueChange={setValue}>
          <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={field.source === 'country' ? 'Choisir un pays' : 'Choisir une langue'} /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      )
    }
    if (field.source === 'product' || field.source === 'collection') {
      // La valeur stockée reste le TITRE (la condition fait « commande contient ce titre »).
      const items = field.source === 'product' ? products : collections
      const ph = field.source === 'product' ? 'Choisir un produit' : 'Choisir une collection'
      return items.length > 0 ? (
        <Select value={String(rule.value ?? '')} onValueChange={setValue}>
          <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={ph} /></SelectTrigger>
          <SelectContent>{items.map((it, i) => <SelectItem key={i} value={it.title}><span className="block max-w-[220px] truncate">{it.title}</span></SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input className="flex-1" placeholder={ph} value={String(rule.value ?? '')} onChange={(e) => setValue(e.target.value)} />
      )
    }
    // Saisie libre (nombre / texte) — collection, montant…
    return (
      <Input className="flex-1" type={field.valueType === 'number' ? 'number' : 'text'} placeholder={field.placeholder}
        value={String(rule.value ?? '')}
        onChange={(e) => setValue(field.valueType === 'number' ? parseFloat(e.target.value) : e.target.value)} />
    )
  }

  return (
    <Shell tone={TONE.violet} icon={<GitBranch className="h-4 w-4" />} kind="Si (condition)" onDelete={onDelete}>
      <div className="space-y-2">
        <Select value={rule.field} onValueChange={(v) => {
          const f = CONDITION_FIELDS.find((x) => x.value === v)!
          const defaultValue = f.multi ? [] : f.valueType === 'boolean' ? true : ''
          onPatch(nodeId, { rule: { field: v as never, op: f.ops[0], value: defaultValue } } as never)
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className={cn('flex gap-2', field.source === 'stage' && 'flex-col')}>
          <Select value={rule.op} onValueChange={(v) => onPatch(nodeId, { rule: { ...rule, op: v as never } } as never)}>
            <SelectTrigger className={field.source === 'stage' ? 'w-full' : 'w-24'}><SelectValue /></SelectTrigger>
            <SelectContent>{field.ops.map((op) => <SelectItem key={op} value={op}>{OP_LABEL[op] || op}</SelectItem>)}</SelectContent>
          </Select>
          {valueEditor()}
        </div>
      </div>
    </Shell>
  )
}

// ---- Connecteurs / inserts --------------------------------------------------

function Connector() {
  const horizontal = useOrientation() === 'horizontal'
  return <div className={cn('bg-border', horizontal ? 'h-px w-4' : 'h-4 w-px')} />
}

function BranchCol({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  const horizontal = useOrientation() === 'horizontal'
  return (
    <div className={cn('flex', horizontal ? 'flex-row items-center gap-1' : 'flex-col items-center')}>
      <span
        className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', horizontal ? 'shrink-0' : 'mb-0.5')}
        style={{ background: `${color}1a`, color }}
      >{label}</span>
      {children}
    </div>
  )
}

function Inserter({ onInsert }: { onInsert: (kind: InsertKind) => void }) {
  const [open, setOpen] = useState(false)
  const horizontal = useOrientation() === 'horizontal'
  return (
    <div className={cn('relative flex items-center', horizontal ? 'flex-row' : 'flex-col')}>
      <div className={cn('bg-border', horizontal ? 'h-px w-3' : 'h-3 w-px')} />
      <button onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary">
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={cn(
            'absolute z-20 flex gap-1 rounded-xl border bg-card p-1 shadow-lg',
            horizontal ? 'left-1/2 top-8 -translate-x-1/2' : 'top-7',
          )}>
            <MenuItem className="text-amber-600" icon={<Clock className="h-3.5 w-3.5" />} label="Délai" onClick={() => { onInsert('delay'); setOpen(false) }} />
            <MenuItem className="text-violet-600" icon={<GitBranch className="h-3.5 w-3.5" />} label="Condition" onClick={() => { onInsert('condition'); setOpen(false) }} />
            <MenuItem className="text-blue-600" icon={<FlaskConical className="h-3.5 w-3.5" />} label="Test A/B" onClick={() => { onInsert('ab_test'); setOpen(false) }} />
            <MenuItem className="text-green-600" icon={<MessageSquare className="h-3.5 w-3.5" />} label="Message" onClick={() => { onInsert('action'); setOpen(false) }} />
          </div>
        </>
      )}
    </div>
  )
}

// ---- Bloc Test A/B ----------------------------------------------------------
type ABVariantResult = { key: string; sent: number; responseRate: number; orderRate: number }

function ABTestBlock({ node, onPatch, onDelete, onAddVariant, onRemoveVariant, automationId, abNumber }: {
  node: WorkflowNode
  onPatch: (id: string, p: Partial<WorkflowNode>) => void
  onDelete: () => void
  onAddVariant?: (nodeId: string) => void
  onRemoveVariant?: (nodeId: string, key: string) => void
  automationId?: string | null
  /** Rang du test A/B dans le workflow (1, 2…) pour le distinguer des autres. */
  abNumber?: number
}) {
  const [results, setResults] = useState<{ variants: ABVariantResult[]; winner: string | null } | null>(null)
  const [showResults, setShowResults] = useState(false)
  const nodeId = node.type === 'ab_test' ? node.id : ''

  useEffect(() => {
    if (!showResults || !automationId || !nodeId) return
    let active = true
    fetch(`/api/automations/${automationId}/ab-results`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!active || !json?.data) return
        const n = json.data.nodes.find((x: { nodeId: string }) => x.nodeId === nodeId)
        setResults(n ? { variants: n.variants, winner: n.winner } : { variants: [], winner: null })
      })
      .catch(() => {})
    return () => { active = false }
  }, [showResults, automationId, nodeId])

  if (node.type !== 'ab_test') return null
  const total = node.variants.reduce((s, v) => s + (Number(v.weight) || 0), 0)
  const setWeight = (key: string, w: number) => {
    const variants = node.variants.map((v) => v.key === key ? { ...v, weight: Math.max(0, Math.min(100, w)) } : v)
    onPatch(node.id, { variants } as Partial<WorkflowNode>)
  }
  return (
    <Shell tone={TONE.pink} icon={<FlaskConical className="h-4 w-4" />} kind={abNumber && abNumber > 0 ? `Test A/B ${abNumber}` : 'Test A/B'} onDelete={onDelete}>
      <p className="mb-2 text-xs text-muted-foreground">Répartit les contacts entre les variantes. Chaque variante a son propre message.</p>
      <div className="space-y-1.5">
        {node.variants.map((v, i) => (
          <div key={v.key} className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: `${VARIANT_COLORS[i % 4]}1a`, color: VARIANT_COLORS[i % 4] }}>{v.key}</span>
            <input type="number" min={0} max={100} value={v.weight}
              onChange={(e) => setWeight(v.key, parseInt(e.target.value, 10) || 0)}
              className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm" />
            <span className="text-xs text-muted-foreground">%</span>
            {node.variants.length > 2 && onRemoveVariant && (
              <button onClick={() => onRemoveVariant(node.id, v.key)} title="Retirer cette variante"
                className="ml-auto rounded p-1 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('text-[11px] font-medium', total === 100 ? 'text-muted-foreground' : 'text-destructive')}>
          Total : {total}% {total !== 100 && '(doit faire 100 %)'}
        </span>
        {node.variants.length < 4 && onAddVariant && (
          <button onClick={() => onAddVariant(node.id)} className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700">
            <Plus className="h-3 w-3" /> Variante
          </button>
        )}
      </div>

      {/* Résultats (si l'automation est enregistrée) */}
      {automationId && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <button onClick={() => setShowResults((s) => !s)} className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <span>📊 Résultats</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showResults && 'rotate-180')} />
          </button>
          {showResults && (
            <div className="mt-2 space-y-1.5">
              {!results ? (
                <p className="text-[11px] text-muted-foreground">Chargement…</p>
              ) : results.variants.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Aucune donnée pour l&apos;instant (les envois apparaîtront ici).</p>
              ) : results.variants.map((v, i) => (
                <div key={v.key} className={cn('rounded-lg border p-2', results.winner === v.key ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/60')}>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: `${VARIANT_COLORS[i % 4]}1a`, color: VARIANT_COLORS[i % 4] }}>{v.key}</span>
                    {results.winner === v.key && <span className="rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-semibold text-emerald-500">Gagnant</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{v.sent} envoi{v.sent > 1 ? 's' : ''}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px]">
                    <span className="text-muted-foreground">Réponse : <span className="font-semibold text-foreground">{v.responseRate}%</span></span>
                    <span className="text-muted-foreground">Commande : <span className="font-semibold text-foreground">{v.orderRate}%</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function MenuItem({ className, icon, label, onClick }: { className?: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted', className)}>
      {icon}{label}
    </button>
  )
}