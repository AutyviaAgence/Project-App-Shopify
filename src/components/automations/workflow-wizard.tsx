'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, ChevronRight, ChevronLeft, Check, Search, X } from 'lucide-react'
import { TRIGGER_EVENTS, triggersForKind, type TriggerEvent } from '@/lib/automations/types'
import { CONDITION_FIELDS } from '@/components/automations/builder/field-labels'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, ConditionRule } from '@/lib/automations/graph-types'
import type { WhatsAppTemplate } from '@/types/database'
import { TemplateBubble } from '@/components/template-bubble'
import { useSubscription } from '@/hooks/use-subscription'
import { UpgradeBadge } from '@/components/upgrade-badge'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'
import { USE_CASES, guessUseCase } from '@/lib/templates/use-cases'
import { useTranslation } from '@/i18n/context'

// `labelKey` = clé i18n résolue via t() au rendu de l'étape « Délai ».
const DELAY_PRESETS: { labelKey: string; minutes: number }[] = [
  { labelKey: 'automations.builder.immediate', minutes: 0 },
  { labelKey: 'automations.builder.preset_30_min', minutes: 30 },
  { labelKey: 'automations.builder.preset_1h', minutes: 60 },
  { labelKey: 'automations.builder.preset_3h', minutes: 180 },
  { labelKey: 'automations.builder.preset_24h', minutes: 1440 },
  { labelKey: 'automations.builder.preset_48h', minutes: 2880 },
  { labelKey: 'automations.builder.duration_7_days', minutes: 10080 },
]

type Variant = { templateId: string | null; weight: number }

// Nom technique de groupe de déclencheurs (== TRIGGER_EVENTS[].group, hors
// périmètre i18n) → clé d'affichage traduite. Inconnu = affiché tel quel.
const TRIGGER_GROUP_KEY: Record<string, string> = {
  'Commande': 'automations.builder.trigger_group_order',
  'Contact': 'automations.builder.trigger_group_contact',
  'Conversation': 'automations.builder.trigger_group_conversation',
  'Planifié': 'automations.builder.trigger_group_scheduled',
}

/**
 * Wizard de création d'automatisation, étape par étape :
 *  1) Événement  2) Conditions  3) Un ou plusieurs messages (A/B)  4) Délai
 *  5) Message(s) → construit un WorkflowGraph et le remonte via onComplete.
 * Aide IA contextuelle aux étapes 1 et 2 (phrase → suggestion).
 */
export function WorkflowWizard({
  templates,
  onComplete,
  onCancel,
  kind = 'transactional',
}: {
  templates: WhatsAppTemplate[]
  onComplete: (data: { name: string; graph: WorkflowGraph; trigger: TriggerEvent }) => void
  onCancel: () => void
  /** Onglet : filtre les déclencheurs + adapte le vocabulaire (campagne vs auto). */
  kind?: 'marketing' | 'transactional'
}) {
  const { t } = useTranslation()
  const isMarketing = kind === 'marketing'
  // Déclencheurs proposés selon l'onglet, regroupés par famille.
  const allowedTriggers = triggersForKind(kind)
  const triggerGroups = [...new Set(allowedTriggers.map((e) => e.group))]
  const { subscription } = useSubscription()
  // L'ASSISTANT IA du wizard est réservé aux plans payants ; la création
  // manuelle d'automatisation reste ouverte (plan Gratuit inclus).
  const aiEnabled = subscription?.aiEnabled !== false
  const [step, setStep] = useState(0)
  const [event, setEvent] = useState<TriggerEvent | null>(null)
  const [useCondition, setUseCondition] = useState(false)
  const [rule, setRule] = useState<ConditionRule>({ field: 'order_total', op: '>', value: 50 })
  const [abTest, setAbTest] = useState(false)
  const [variants, setVariants] = useState<Variant[]>([{ templateId: null, weight: 50 }, { templateId: null, weight: 50 }])
  const [singleTemplate, setSingleTemplate] = useState<string | null>(null)
  const [delayMin, setDelayMin] = useState(0)
  const [name, setName] = useState('')

  // Aide IA (étapes 1 et 2).
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  async function suggestEvent() {
    if (!aiText.trim()) return
    setAiBusy(true)
    try {
      const res = await fetch('/api/automations/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'event', text: aiText }),
      })
      const json = await res.json()
      // L'IA peut proposer un trigger hors onglet : on ne l'accepte que s'il
      // fait partie des déclencheurs autorisés ici (sinon non sélectionnable).
      if (json.event && allowedTriggers.some((e) => e.value === json.event)) {
        setEvent(json.event); toast.success(t('automations.builder.toast_event_suggested'))
      } else if (json.event) {
        toast.error(isMarketing ? t('automations.builder.toast_event_wrong_tab_marketing') : t('automations.builder.toast_event_wrong_tab_transactional'))
      } else toast.error(t('automations.builder.toast_no_event_found'))
    } catch { toast.error(t('automations.builder.toast_error')) } finally { setAiBusy(false); setAiText('') }
  }

  async function suggestCondition() {
    if (!aiText.trim()) return
    setAiBusy(true)
    try {
      const res = await fetch('/api/automations/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'condition', text: aiText }),
      })
      const json = await res.json()
      if (json.rule) { setRule(json.rule); setUseCondition(true); toast.success(t('automations.builder.toast_condition_suggested')) }
      else toast.error(t('automations.builder.toast_condition_not_deduced'))
    } catch { toast.error(t('automations.builder.toast_error')) } finally { setAiBusy(false); setAiText('') }
  }

  // Construit le graphe final à partir des choix du wizard.
  function buildGraph(): WorkflowGraph | null {
    if (!event) return null
    const nodes: WorkflowNode[] = [{ id: 'trigger', type: 'trigger', event }]
    const edges: WorkflowEdge[] = []
    let cursor = 'trigger'
    let cursorBranch: string | undefined

    // Condition (optionnelle) → branche 'yes' vers la suite.
    if (useCondition) {
      nodes.push({ id: 'cond', type: 'condition', rule })
      edges.push({ from: cursor, to: 'cond', branch: cursorBranch })
      cursor = 'cond'; cursorBranch = 'yes'
    }

    // Délai (si > 0).
    if (delayMin > 0) {
      nodes.push({ id: 'delay', type: 'delay', minutes: delayMin })
      edges.push({ from: cursor, to: 'delay', branch: cursorBranch })
      cursor = 'delay'; cursorBranch = undefined
    }

    // Message(s) : A/B ou message unique.
    if (abTest) {
      const valid = variants.filter((v) => v.templateId)
      if (valid.length < 2) return null
      const total = valid.reduce((s, v) => s + v.weight, 0)
      const norm = valid.map((v) => ({ ...v, weight: Math.round((v.weight / total) * 100) }))
      // Ajuste pour que la somme fasse exactement 100.
      const diff = 100 - norm.reduce((s, v) => s + v.weight, 0)
      if (norm.length) norm[0].weight += diff
      nodes.push({ id: 'ab', type: 'ab_test', variants: norm.map((_, i) => ({ key: String.fromCharCode(65 + i), weight: norm[i].weight })) })
      edges.push({ from: cursor, to: 'ab', branch: cursorBranch })
      norm.forEach((v, i) => {
        const key = String.fromCharCode(65 + i)
        const aid = `action_${key}`
        nodes.push({ id: aid, type: 'action', templateId: v.templateId })
        edges.push({ from: 'ab', to: aid, branch: `variant:${key}` })
      })
    } else {
      if (!singleTemplate) return null
      nodes.push({ id: 'action_1', type: 'action', templateId: singleTemplate })
      edges.push({ from: cursor, to: 'action_1', branch: cursorBranch })
    }

    return { nodes, edges }
  }

  function finish() {
    const graph = buildGraph()
    if (!graph || !event) { toast.error(t('automations.builder.toast_complete_message')); return }
    onComplete({ name: name.trim() || defaultName(event, t), graph, trigger: event })
  }

  // ── Étapes ──
  const steps = [
    t('automations.builder.step_event'),
    t('automations.builder.step_conditions'),
    t('automations.builder.step_messages'),
    t('automations.builder.step_delay'),
    t('automations.builder.step_finalize'),
  ]
  const canNext =
    (step === 0 && !!event) ||
    (step === 1) ||
    (step === 2 && (abTest ? variants.filter((v) => v.templateId).length >= 2 : !!singleTemplate)) ||
    (step === 3) ||
    step === 4

  // L'étape « Message(s) » (galeries de templates) prend toute la largeur ;
  // les autres restent lisibles dans une colonne centrée.
  const wide = step === 2
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-4 p-4 md:p-6', wide ? 'max-w-none' : 'max-w-3xl lg:max-w-4xl')}>
      {/* Barre d'étapes */}
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">← {t('automations.builder.back')}</button>
        <div className="ml-2 flex flex-1 items-center gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1.5">
              <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary/15 text-primary ring-1 ring-primary' : 'bg-muted text-muted-foreground')}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={cn('h-0.5 flex-1 rounded', i < step ? 'bg-primary' : 'bg-muted')} />}
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm font-semibold">{steps[step]}</p>

      {/* ── Étape 0 : Événement ── */}
      {step === 0 && (
        <div className="space-y-3">
          {aiEnabled ? (
            <AiHelp value={aiText} onChange={setAiText} busy={aiBusy} onGo={suggestEvent}
              placeholder={isMarketing ? t('automations.builder.ai_placeholder_marketing') : t('automations.builder.ai_placeholder_event')} />
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> {t('automations.builder.ai_help_event')}</span>
              <UpgradeBadge />
            </div>
          )}
          {/* Déclencheurs FILTRÉS par onglet (marketing : planifié/opt-in/clic
              bouton/relances/panier ; transactionnel : statuts commande). */}
          {triggerGroups.map((group) => (
            <div key={group} className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{TRIGGER_GROUP_KEY[group] ? t(TRIGGER_GROUP_KEY[group]) : group}</p>
              <div className="flex flex-wrap gap-1.5">
                {allowedTriggers.filter((e) => e.group === group).map((e) => (
                  <button key={e.value} onClick={() => setEvent(e.value)}
                    title={t(e.descKey)}
                    className={cn('rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      event === e.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                    {t(e.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Étape 1 : Conditions ── */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setUseCondition(false)}
              className={cn('flex-1 rounded-lg border p-3 text-left text-sm', !useCondition ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
              <p className="font-medium">{t('automations.builder.for_all_customers')}</p>
              <p className="text-xs text-muted-foreground">{t('automations.builder.no_condition')}</p>
            </button>
            <button onClick={() => setUseCondition(true)}
              className={cn('flex-1 rounded-lg border p-3 text-left text-sm', useCondition ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
              <p className="font-medium">{t('automations.builder.under_condition')}</p>
              <p className="text-xs text-muted-foreground">{t('automations.builder.condition_examples')}</p>
            </button>
          </div>
          {useCondition && (
            <div className="space-y-2 rounded-lg border p-3">
              {aiEnabled && (
                <AiHelp value={aiText} onChange={setAiText} busy={aiBusy} onGo={suggestCondition}
                  placeholder={t('automations.builder.ai_placeholder_condition')} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select value={rule.field}
                  onChange={(e) => { const f = CONDITION_FIELDS.find((x) => x.value === e.target.value)!; setRule({ field: f.value, op: f.ops[0], value: f.valueType === 'boolean' ? true : '' }) }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  {/* has_stage nécessite une multi-sélection de tags → réservé au
                      builder complet, pas à ce mini-éditeur texte. */}
                  {CONDITION_FIELDS.filter((f) => !f.multi).map((f) => <option key={f.value} value={f.value}>{t(f.labelKey)}</option>)}
                </select>
                <select value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as ConditionRule['op'] })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  {(CONDITION_FIELDS.find((f) => f.value === rule.field)?.ops || []).map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input value={String(rule.value ?? '')} onChange={(e) => setRule({ ...rule, value: e.target.value })}
                  placeholder={t('automations.builder.value')} className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Étape 2 : Message(s) / A/B ── */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setAbTest(false)}
              className={cn('flex-1 rounded-lg border p-3 text-left text-sm', !abTest ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
              <p className="font-medium">{t('automations.builder.single_message')}</p>
            </button>
            <button onClick={() => setAbTest(true)}
              className={cn('flex-1 rounded-lg border p-3 text-left text-sm', abTest ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
              <p className="font-medium">{t('automations.builder.node_ab_test')}</p>
              <p className="text-xs text-muted-foreground">{t('automations.builder.compare_messages')}</p>
            </button>
          </div>

          {!abTest ? (
            <TemplateSelect templates={templates} value={singleTemplate} onChange={setSingleTemplate} />
          ) : (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="min-w-0 space-y-2 rounded-lg border p-3">
                  {/* En-tête variante : lettre + poids % + suppression */}
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{String.fromCharCode(65 + i)}</span>
                    <span className="text-sm font-medium">{t('automations.builder.variant')} {String.fromCharCode(65 + i)}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <input type="number" min={1} max={100} value={v.weight}
                        onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) || 0 } : x))}
                        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm" />
                      <span className="text-xs text-muted-foreground">%</span>
                      {variants.length > 2 && (
                        <button onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))} title={t('automations.builder.remove_variant_short')}
                          className="ml-1 rounded p-1 text-muted-foreground hover:text-destructive">✕</button>
                      )}
                    </div>
                  </div>
                  {/* Galerie de templates, sur toute la largeur (défilement horizontal contenu) */}
                  <TemplateSelect templates={templates} value={v.templateId} onChange={(id) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, templateId: id } : x))} />
                </div>
              ))}
              {variants.length < 4 && (
                <button onClick={() => setVariants((prev) => [...prev, { templateId: null, weight: 0 }])}
                  className="text-xs text-primary hover:underline">{t('automations.builder.add_variant')}</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Étape 3 : Délai ── */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('automations.builder.delay_after_event')}</p>
          <div className="flex flex-wrap gap-1.5">
            {DELAY_PRESETS.map((d) => (
              <button key={d.minutes} onClick={() => setDelayMin(d.minutes)}
                className={cn('rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  delayMin === d.minutes ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Étape 4 : Finaliser ── */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{isMarketing ? t('automations.builder.name_campaign') : t('automations.builder.name_automation')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={event ? defaultName(event, t) : (isMarketing ? t('automations.builder.my_campaign') : t('automations.builder.my_automation'))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p><span className="text-muted-foreground">{t('automations.builder.recap_trigger')}</span> {(() => { const ev = TRIGGER_EVENTS.find((e) => e.value === event); return ev ? t(ev.labelKey) : '' })()}</p>
            {useCondition && <p><span className="text-muted-foreground">{t('automations.builder.recap_condition')}</span> {(() => { const f = CONDITION_FIELDS.find((f) => f.value === rule.field); return f ? t(f.labelKey) : '' })()} {rule.op} {String(rule.value)}</p>}
            <p><span className="text-muted-foreground">{t('automations.builder.recap_delay')}</span> {(() => { const d = DELAY_PRESETS.find((d) => d.minutes === delayMin); return d ? t(d.labelKey) : `${delayMin} min` })()}</p>
            <p><span className="text-muted-foreground">{t('automations.builder.recap_message')}</span> {abTest ? t('automations.builder.ab_test_variants_count', { count: variants.filter((v) => v.templateId).length }) : (templates.find((tpl) => tpl.id === singleTemplate)?.name || '—')}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t('automations.builder.fine_tune_notice')}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-2 flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {t('automations.builder.previous')}
        </Button>
        {step < steps.length - 1 ? (
          <Button size="sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            {t('automations.builder.next')} <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={finish}>
            <Check className="mr-1 h-4 w-4" /> {t('automations.builder.create_and_open_editor')}
          </Button>
        )}
      </div>
    </div>
  )
}

function defaultName(event: TriggerEvent, t: (key: string) => string): string {
  return TRIGGER_EVENTS.find((e) => e.value === event)?.label || t('automations.builder.wizard_default_automation_name')
}

/** Champ d'aide IA (phrase → suggestion). */
function AiHelp({ value, onChange, busy, onGo, placeholder }: {
  value: string; onChange: (v: string) => void; busy: boolean; onGo: () => void; placeholder: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <input value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onGo() }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
      <Button size="sm" variant="ghost" className="h-7 text-primary" disabled={busy || !value.trim()} onClick={onGo}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('automations.builder.ai_suggest')}
      </Button>
    </div>
  )
}

// Types de modèles : libellés issus de USE_CASES, la même source que la page
// Modèles et que le sélecteur du builder — plus de libellés dupliqués.
// La catégorie « all » porte une clé i18n (résolue au rendu de TemplateSelect) ;
// les autres viennent de USE_CASES (source hors périmètre, déjà gérée ailleurs).
const PICKER_CATS: { key: string; label: string; labelKey?: string }[] = [
  { key: 'all', label: 'Tous', labelKey: 'automations.builder.all' },
  ...USE_CASES.map((u) => ({ key: u.key as string, label: u.label })),
]

/** Catégorie d'un modèle. `use_case` est NULL sur ceux importés de Meta : on la
 *  DÉDUIT alors du nom (comme la page Modèles), sinon aucune puce ne s'afficherait. */
function catOfTemplate(t: WhatsAppTemplate): string {
  return (t as { use_case?: string }).use_case
    || guessUseCase(t.name, (t as { category?: string }).category)
}

/** Sélecteur VISUEL de template : catégories + bulles d'aperçu horizontales.
 *  Bulles assez grandes pour lire le message en entier. */
function TemplateSelect({ templates, value, onChange }: {
  templates: WhatsAppTemplate[]; value: string | null; onChange: (id: string) => void; compact?: boolean
}) {
  const { t } = useTranslation()
  const [cat, setCat] = useState('all')
  // Recherche libre : nom, contenu du message, langue. Indispensable dès qu'un
  // même modèle existe en plusieurs langues (panier_abandonne fr + en…).
  const [query, setQuery] = useState('')
  const labelsFor = (tpl: WhatsAppTemplate) => (tpl.variable_keys || []).map((k) => { const v = VARIABLE_BY_KEY[k]; return v ? t(v.labelKey) : k })
  if (templates.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{t('automations.builder.no_approved_template')}</p>
  }
  const present = new Set(templates.map(catOfTemplate))
  const cats = PICKER_CATS.filter((c) => c.key === 'all' || present.has(c.key))
  const q = query.trim().toLowerCase()
  const shown = templates
    .filter((t) => cat === 'all' || catOfTemplate(t) === cat)
    .filter((t) => {
      if (!q) return true
      const hay = [t.name, t.body_text, t.header_text, t.language]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  return (
    <div className="space-y-2">
      {/* Recherche + compteur */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('automations.builder.search_template_placeholder')}
            className="h-8 w-full rounded-lg border border-input bg-background pl-7 pr-7 text-xs outline-none focus:border-primary"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} title={t('automations.builder.clear')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{shown.length > 1 ? t('automations.builder.templates_count_plural', { count: shown.length }) : t('automations.builder.templates_count', { count: shown.length })}</span>
      </div>
      {/* Catégories */}
      <div className="flex flex-wrap gap-1">
        {cats.map((c) => {
          // Compteur par type, sur l'ensemble des modèles (pas le sous-ensemble
          // filtré) : le nombre affiché ne bouge donc pas quand on change d'onglet.
          const count = c.key === 'all'
            ? templates.length
            : templates.filter((t) => catOfTemplate(t) === c.key).length
          return (
            <button key={c.key} type="button" onClick={() => setCat(c.key)}
              className={cn('rounded-full px-2.5 py-1 text-[11px] transition-colors',
                cat === c.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {c.labelKey ? t(c.labelKey) : c.label} ({count})
            </button>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {t('automations.builder.no_template_matches', { query: q ? t('automations.builder.no_template_matches_query', { query: query.trim() }) : '' })}
        </p>
      ) : (
        /* Bulles (grandes) en défilement horizontal */
        <div
          className="flex gap-3 overflow-x-auto overscroll-contain pb-2 [scrollbar-width:thin]"
          onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; e.stopPropagation() } }}
        >
          {shown.map((t) => {
            const sel = t.id === value
            return (
              <button key={t.id} type="button" onClick={() => onChange(t.id)}
                className={cn('w-[240px] shrink-0 rounded-xl border p-2.5 text-left transition-colors',
                  sel ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-foreground/30 hover:bg-muted/40')}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</p>
                  {t.language && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">{t.language}</span>
                  )}
                </div>
                <div className="max-h-[360px] overflow-y-auto [scrollbar-width:thin]">
                  <TemplateBubble template={t} labels={labelsFor(t)} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
