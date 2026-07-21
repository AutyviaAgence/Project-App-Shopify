'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check, ShoppingBag, Package, Repeat, Heart, MessageSquare, ArrowLeft, ArrowRight } from 'lucide-react'
import { OnboardingFeedback } from '@/components/onboarding-feedback'
import { useTranslation } from '@/i18n/context'

/**
 * Onboarding e-commerce PRÉ-REMPLI de l'agent SAV.
 * L'agent est déjà créé à la connexion de la boutique ; ici on le RAFFINE :
 * l'IA propose une config déduite de l'analyse boutique, le marchand confirme.
 */

// Les libellés sont résolus via i18n au rendu (voir OBJECTIVES/TONES/LANGS dans le composant).
const OBJECTIVE_META = [
  { key: 'sav', labelKey: 'agents.onboard_obj_sav', descKey: 'agents.onboard_obj_sav_desc', icon: Package },
  { key: 'advice', labelKey: 'agents.onboard_obj_advice', descKey: 'agents.onboard_obj_advice_desc', icon: ShoppingBag },
  { key: 'conversion', labelKey: 'agents.onboard_obj_conversion', descKey: 'agents.onboard_obj_conversion_desc', icon: Repeat },
  { key: 'loyalty', labelKey: 'agents.onboard_obj_loyalty', descKey: 'agents.onboard_obj_loyalty_desc', icon: Heart },
]
const TONE_META = [
  { key: 'professional', labelKey: 'agents.tone_professional_full' },
  { key: 'friendly', labelKey: 'agents.tone_friendly' },
  { key: 'casual', labelKey: 'agents.tone_casual_full' },
]
const LANG_META = [
  { key: 'fr', labelKey: 'agents.onboard_lang_fr' }, { key: 'en', labelKey: 'agents.onboard_lang_en' }, { key: 'es', labelKey: 'agents.onboard_lang_es' },
  { key: 'de', labelKey: 'agents.onboard_lang_de' }, { key: 'it', labelKey: 'agents.onboard_lang_it' }, { key: 'pt', labelKey: 'agents.onboard_lang_pt' },
]

type Config = {
  name: string; description: string; objective: string
  tone: string; languages: string[]; system_prompt: string; objectives: string[]
  escalation_situations: string
}

export default function AgentOnboardPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const OBJECTIVES = OBJECTIVE_META.map((o) => ({ ...o, label: t(o.labelKey), desc: t(o.descKey) }))
  const TONES = TONE_META.map((tn) => ({ ...tn, label: t(tn.labelKey) }))
  const LANGS = LANG_META.map((l) => ({ ...l, label: t(l.labelKey) }))
  const [cfg, setCfg] = useState<Config | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [objectives, setObjectives] = useState<string[]>(['sav', 'advice', 'conversion', 'loyalty'])
  const [tone, setTone] = useState('friendly')
  const [langs, setLangs] = useState<string[]>(['fr'])
  const [name, setName] = useState('')
  const [escalation, setEscalation] = useState(true)
  const [escalationSituations, setEscalationSituations] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [delayMin, setDelayMin] = useState(30)
  const [delayMax, setDelayMax] = useState(60)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [step, setStep] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)

  // Récupère l'agent existant (créé à la connexion) + génère la config déduite.
  // Les deux appels partent EN PARALLÈLE : la génération IA (le plus long) ne
  // dépend pas de la liste d'agents, donc on ne l'attend pas pour la lancer.
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((agentsRes) => {
        const first = agentsRes.data?.[0]
        if (first) {
          setAgentId(first.id)
          if (typeof first.response_delay_min === 'number') setDelayMin(first.response_delay_min)
          if (typeof first.response_delay_max === 'number') setDelayMax(first.response_delay_max)
        }
      })
      .catch(() => {})
    generate(['sav', 'advice', 'conversion', 'loyalty'])
  }, [])

  async function generate(objs: string[]) {
    setRegenerating(true)
    try {
      const res = await fetch('/api/agents/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectives: objs }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('agents.onboard_error'))
      const c = json.data as Config
      setCfg(c)
      setName(c.name)
      setTone(c.tone)
      setLangs(c.languages?.length ? c.languages : ['fr'])
      setObjectives(c.objectives?.length ? c.objectives : objs)
      setSystemPrompt(c.system_prompt || '')
      setEscalationSituations(c.escalation_situations || '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('agents.onboard_error'))
    } finally {
      setRegenerating(false)
    }
  }

  async function activate() {
    if (!cfg) return
    setSaving(true)
    try {
      const body = {
        name: name.trim() || cfg.name,
        description: cfg.description,
        objective: cfg.objective,
        system_prompt: systemPrompt.trim() || cfg.system_prompt,
        auto_detect_language: langs.length > 1,
        escalation_enabled: escalation,
        // Transfert vers un humain : détection 100 % IA (pas de mots-clés).
        escalation_mode: 'ai',
        escalation_situations: escalation ? escalationSituations.trim() || null : null,
        response_delay_min: delayMin,
        response_delay_max: delayMax,
        is_active: true,
      }
      // Met à jour l'agent existant, ou en crée un si aucun.
      const res = agentId
        ? await fetch(`/api/agents/${agentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || t('agents.onboard_error'))
      // Marque l'onboarding comme fait (ne se redéclenchera plus automatiquement).
      fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_onboarding_done: true }) }).catch(() => {})
      toast.success(t('agents.onboard_activated'))
      router.push('/agents')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('agents.onboard_error'))
    } finally {
      setSaving(false)
    }
  }

  function toggleObjective(k: string) {
    setObjectives((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])
  }
  function toggleLang(k: string) {
    setLangs((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])
  }

  // Petit message encourageant façon "blow up" selon l'étape qu'on vient de valider.
  function feedbackFor(s: number): string {
    switch (s) {
      case 0: return name.trim() ? t('agents.onboard_fb_name', { name: name.trim() }) : t('agents.onboard_fb_noted')
      case 1: return objectives.length > 1 ? t('agents.onboard_fb_objectives_many') : t('agents.onboard_fb_objectives_one')
      case 2: return t('agents.onboard_fb_tone')
      case 3: return langs.length > 1 ? t('agents.onboard_fb_langs_many') : t('agents.onboard_fb_langs_one')
      case 4: return t('agents.onboard_fb_delay')
      case 5: return escalation ? t('agents.onboard_fb_transfer_on') : t('agents.onboard_fb_transfer_off')
      case 6: return t('agents.onboard_fb_instructions')
      default: return t('agents.onboard_fb_default')
    }
  }

  // Avance à l'étape suivante en flashant un feedback animé (façon questionnaire "blow up").
  function goNext() {
    if (advancing) return
    setFeedback(feedbackFor(step))
    setAdvancing(true)
    // Le feedback reste visible ~1,3 s pour bien le voir avant de passer à la suite.
    setTimeout(() => {
      setStep((s) => Math.min(TOTAL - 1, s + 1))
      setFeedback(null)
      setAdvancing(false)
    }, 1300)
  }

  // Une question par écran. 8 écrans. Le questionnaire démarre TOUT DE SUITE ;
  // la génération IA (ton/langues/instructions) se fait en arrière-plan pendant
  // que l'utilisateur remplit les premières étapes.
  const TOTAL = 8
  const isLast = step === TOTAL - 1
  const toneLabel = TONES.find((t) => t.key === tone)?.label || tone
  const langLabels = langs.map((k) => LANGS.find((l) => l.key === k)?.label || k)
  const objLabels = objectives.map((k) => OBJECTIVES.find((o) => o.key === k)?.label || k)

  // Titres de chaque question (pour l'en-tête)
  const QUESTIONS = [
    t('agents.onboard_q_name'),
    t('agents.onboard_q_objectives'),
    t('agents.onboard_q_tone'),
    t('agents.onboard_q_langs'),
    t('agents.onboard_q_delay'),
    t('agents.onboard_q_transfer'),
    t('agents.onboard_q_instructions'),
    t('agents.onboard_q_ready'),
  ]

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      {/* Progression : barre + compteur */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('agents.onboard_step', { current: step + 1, total: TOTAL })}</span>
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" /> {t('agents.onboard_prefilled')}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      {/* Question courante */}
      <div className="relative flex flex-1 flex-col">
        <OnboardingFeedback feedback={feedback ? { message: feedback } : null} />

        <div key={step} className={cn('flex flex-1 flex-col justify-center transition-opacity duration-200', advancing ? 'opacity-0' : 'animate-question-enter opacity-100')}>
        <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">{QUESTIONS[step]}</h1>

        <div className="mt-5">
          {/* Q1, Nom */}
          {step === 0 && (
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder={t('agents.onboard_name_placeholder')}
              className="h-12 w-full rounded-lg border border-input bg-background px-4 text-base" />
          )}

          {/* Q2, Objectifs */}
          {step === 1 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t('agents.onboard_select_all')}</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {OBJECTIVES.map((o) => {
                  const on = objectives.includes(o.key)
                  const Icon = o.icon
                  return (
                    <button key={o.key} onClick={() => toggleObjective(o.key)}
                      className={cn('flex items-start gap-2.5 rounded-xl border p-4 text-left transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
                      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{o.label}</p>
                        <p className="text-xs text-muted-foreground">{o.desc}</p>
                      </div>
                      {on && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Q3, Ton */}
          {step === 2 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t('agents.onboard_tone_deduced')}</p>
              <div className="flex flex-col gap-2">
                {TONES.map((t) => (
                  <button key={t.key} onClick={() => setTone(t.key)}
                    className={cn('flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium transition-colors',
                      tone === t.key ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {t.label}
                    {tone === t.key && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Q4, Langues */}
          {step === 3 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t('agents.onboard_select_langs')}</p>
              <div className="flex flex-wrap gap-2">
                {LANGS.map((l) => (
                  <button key={l.key} onClick={() => toggleLang(l.key)}
                    className={cn('rounded-full border px-4 py-2 text-sm transition-colors',
                      langs.includes(l.key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {l.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Q5, Délai */}
          {step === 4 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">{t('agents.onboard_delay_natural')}</p>
              <div className="flex flex-wrap items-center gap-3 text-base">
                <span className="text-muted-foreground">{t('agents.onboard_between')}</span>
                <input type="number" min={0} max={60} value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                  className="h-12 w-16 rounded-lg border border-input bg-background px-2 text-center" />
                <span className="text-muted-foreground">{t('agents.onboard_and')}</span>
                <input type="number" min={0} max={60} value={delayMax}
                  onChange={(e) => setDelayMax(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                  className="h-12 w-16 rounded-lg border border-input bg-background px-2 text-center" />
                <span className="text-muted-foreground">{t('agents.onboard_seconds')}</span>
              </div>
            </>
          )}

          {/* Q6, Transfert humain */}
          {step === 5 && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-4 text-sm font-medium">
                <input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} className="h-4 w-4 accent-primary" />
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>{t('agents.onboard_transfer_label')}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t('agents.onboard_transfer_explain')} <span className="font-medium text-foreground">{t('agents.onboard_conversations_tab')}</span>.
              </p>
              {escalation && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t('agents.onboard_situations_label')}</label>
                  <textarea
                    value={escalationSituations}
                    onChange={(e) => setEscalationSituations(e.target.value)}
                    rows={6}
                    placeholder={t('agents.onboard_situations_placeholder')}
                    className="mt-1 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-relaxed"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('agents.onboard_situations_help')}</p>
                </div>
              )}
            </div>
          )}

          {/* Q7, Instructions */}
          {step === 6 && (
            <div className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('agents.onboard_instructions_generated')}</p>
                <Button variant="outline" size="sm" disabled={regenerating} onClick={() => generate(objectives)}>
                  {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  {t('agents.onboard_regenerate')}
                </Button>
              </div>
              <div className="relative flex-1">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  disabled={regenerating}
                  className="h-full w-full resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-relaxed min-h-[380px]"
                />
                {regenerating && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('agents.onboard_writing_instructions')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Q8, Récap */}
          {step === 7 && (
            <dl className="divide-y rounded-xl border">
              {[
                { label: t('agents.onboard_recap_name'), value: name || cfg?.name || t('agents.onboard_recap_agent_fallback') },
                { label: t('agents.onboard_recap_objectives'), value: objLabels.join(', ') || '—' },
                { label: t('agents.onboard_recap_tone'), value: toneLabel },
                { label: t('agents.onboard_recap_langs'), value: langLabels.join(', ') },
                { label: t('agents.onboard_recap_delay'), value: `${delayMin}–${delayMax} ${t('agents.unit_sec')}` },
                { label: t('agents.onboard_recap_transfer'), value: escalation ? t('agents.onboard_transfer_on') : t('agents.onboard_transfer_off') },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 break-words text-right text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        {/* À la 1ʳᵉ étape, « Retour » sort de l'assistant (sinon l'utilisateur est
            piégé : le bouton était désactivé et aucune autre sortie n'existait). */}
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || advancing}
          onClick={() => (step === 0 ? router.push('/agents') : setStep((s) => Math.max(0, s - 1)))}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {step === 0 ? t('agents.onboard_cancel') : t('agents.onboard_back')}
        </Button>
        {isLast ? (
          <Button disabled={saving || regenerating || !cfg} onClick={activate}>
            {saving || !cfg ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            {!cfg ? t('agents.onboard_preparing') : t('agents.onboard_activate')}
          </Button>
        ) : (
          <Button disabled={advancing} onClick={goNext}>
            {t('agents.onboard_next')} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
