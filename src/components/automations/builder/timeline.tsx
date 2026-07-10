'use client'

import React, { useState, useEffect } from 'react'
import { Clock, GitBranch, MessageSquare, Plus, ShoppingBag, Trash2, FlaskConical, Users, CalendarClock, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChevronDown } from 'lucide-react'
import { TRIGGER_EVENTS, triggersForKind } from '@/lib/automations/types'

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
import { CONDITION_FIELDS, COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from './field-labels'
import { chainFrom, getNode } from './timeline-model'
import { TemplateBubble } from '@/components/template-bubble'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import { USE_CASES, guessUseCase } from '@/lib/templates/use-cases'
import type { WorkflowGraph, WorkflowNode } from '@/lib/automations/graph-types'
import { buttonBranch } from '@/lib/automations/graph-types'
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
  const { graph, fromId, branch, templates, onPatch, onInsert, onDelete, onSelectAction } = props
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
              <ActionBlock node={node} templates={templates} onPatch={onPatch} onDelete={() => onDelete(id)} onSelectAction={onSelectAction} />
              <div className={branchesRow}>
                {buttons.map((text, bi) => (
                  <BranchCol key={text} label={text} color={BUTTON_COLORS[bi % BUTTON_COLORS.length]}>
                    <Branch {...props} fromId={id} branch={buttonBranch(text)} />
                  </BranchCol>
                ))}
              </div>
            </React.Fragment>
          )
          return (
            <React.Fragment key={id}>
              <ActionBlock node={node} templates={templates} onPatch={onPatch} onDelete={() => onDelete(id)} onSelectAction={onSelectAction} />
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
              automationId={props.automationId} />
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
    </div>
  )
}

function DelayBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  if (node.type !== 'delay') return null
  return (
    <Shell tone={TONE.amber} icon={<Clock className="h-4 w-4" />} kind="Attendre" onDelete={onDelete}>
      <Select value={String(node.minutes)} onValueChange={(v) => onPatch(node.id, { minutes: parseInt(v, 10) } as never)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{DELAY_PRESETS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
      </Select>
    </Shell>
  )
}

function ActionBlock({ node, templates, onPatch, onDelete, onSelectAction }: {
  node: WorkflowNode; templates: WhatsAppTemplate[]
  onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void; onSelectAction: (t: string | null) => void
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
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">{badge(selected)}</div>
              <TemplateBubble template={selected} labels={labelsFor(selected)} />
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

function ConditionBlock({ node, onPatch, onDelete }: { node: WorkflowNode; onPatch: (id: string, p: Partial<WorkflowNode>) => void; onDelete: () => void }) {
  const products = useShopList('/api/shopify/products')
  const collections = useShopList('/api/shopify/collections')
  if (node.type !== 'condition') return null
  const rule = node.rule
  const nodeId = node.id
  const field = CONDITION_FIELDS.find((f) => f.value === rule.field) || CONDITION_FIELDS[0]
  const setValue = (value: string | number | boolean) => onPatch(nodeId, { rule: { ...rule, value } } as never)

  // Choix de l'éditeur de VALEUR selon la source du champ.
  function valueEditor() {
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
          onPatch(nodeId, { rule: { field: v as never, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' } } as never)
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={rule.op} onValueChange={(v) => onPatch(nodeId, { rule: { ...rule, op: v as never } } as never)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{field.ops.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
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

function ABTestBlock({ node, onPatch, onDelete, onAddVariant, onRemoveVariant, automationId }: {
  node: WorkflowNode
  onPatch: (id: string, p: Partial<WorkflowNode>) => void
  onDelete: () => void
  onAddVariant?: (nodeId: string) => void
  onRemoveVariant?: (nodeId: string, key: string) => void
  automationId?: string | null
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
    <Shell tone={TONE.pink} icon={<FlaskConical className="h-4 w-4" />} kind="Test A/B" onDelete={onDelete}>
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