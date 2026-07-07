'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check, ShoppingBag, Package, Repeat, Heart, MessageSquare, ArrowLeft, ArrowRight } from 'lucide-react'
import { BlobLoaderScreen } from '@/components/blob-loader'

/**
 * Onboarding e-commerce PRÉ-REMPLI de l'agent SAV.
 * L'agent est déjà créé à la connexion de la boutique ; ici on le RAFFINE :
 * l'IA propose une config déduite de l'analyse boutique, le marchand confirme.
 */

const OBJECTIVES = [
  { key: 'sav', label: 'SAV commandes', desc: 'Suivi, retours, remboursements, annulations', icon: Package },
  { key: 'advice', label: 'Conseil produits', desc: 'Tailles, dispo, recommandations du catalogue', icon: ShoppingBag },
  { key: 'conversion', label: 'Conversion', desc: 'Objections, propositions, paniers', icon: Repeat },
  { key: 'loyalty', label: 'Fidélisation', desc: 'Avis, offres, réengagement après-achat', icon: Heart },
]
const TONES = [
  { key: 'professional', label: 'Professionnel' },
  { key: 'friendly', label: 'Chaleureux' },
  { key: 'casual', label: 'Décontracté' },
]
const LANGS = [
  { key: 'fr', label: 'Français' }, { key: 'en', label: 'Anglais' }, { key: 'es', label: 'Espagnol' },
  { key: 'de', label: 'Allemand' }, { key: 'it', label: 'Italien' }, { key: 'pt', label: 'Portugais' },
]

type Config = {
  name: string; description: string; objective: string
  tone: string; languages: string[]; system_prompt: string; objectives: string[]
  escalation_situations: string
}

export default function AgentOnboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
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
  useEffect(() => {
    (async () => {
      try {
        const agentsRes = await fetch('/api/agents').then((r) => r.json())
        const first = agentsRes.data?.[0]
        if (first) {
          setAgentId(first.id)
          // Reprend les réglages existants de l'agent (créé à la connexion).
          if (typeof first.response_delay_min === 'number') setDelayMin(first.response_delay_min)
          if (typeof first.response_delay_max === 'number') setDelayMax(first.response_delay_max)
        }
        await generate(['sav', 'advice', 'conversion', 'loyalty'])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function generate(objs: string[]) {
    setRegenerating(true)
    try {
      const res = await fetch('/api/agents/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectives: objs }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      const c = json.data as Config
      setCfg(c)
      setName(c.name)
      setTone(c.tone)
      setLangs(c.languages?.length ? c.languages : ['fr'])
      setObjectives(c.objectives?.length ? c.objectives : objs)
      setSystemPrompt(c.system_prompt || '')
      setEscalationSituations(c.escalation_situations || '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
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
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      // Marque l'onboarding comme fait (ne se redéclenchera plus automatiquement).
      fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_onboarding_done: true }) }).catch(() => {})
      toast.success('Agent configuré et activé 🎉')
      router.push('/agents')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
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
      case 0: return name.trim() ? `Joli nom, ${name.trim()} ✨` : 'Noté ✨'
      case 1: return objectives.length > 1 ? 'Bel éventail de missions 💪' : 'Mission claire 🎯'
      case 2: return 'Un ton qui vous ressemble 🎨'
      case 3: return langs.length > 1 ? 'Multilingue, malin 🌍' : 'Parfait 👌'
      case 4: return 'Timing réglé ⏱️'
      case 5: return escalation ? 'Bien vu, vos clients seront entre de bonnes mains 🤝' : 'Compris 👍'
      case 6: return 'Instructions calées 📝'
      default: return 'Super !'
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

  if (loading) return <BlobLoaderScreen />

  // Une question par écran. 8 écrans.
  const TOTAL = 8
  const isLast = step === TOTAL - 1
  const toneLabel = TONES.find((t) => t.key === tone)?.label || tone
  const langLabels = langs.map((k) => LANGS.find((l) => l.key === k)?.label || k)
  const objLabels = objectives.map((k) => OBJECTIVES.find((o) => o.key === k)?.label || k)

  if (!cfg) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyse de votre boutique…
        </div>
      </div>
    )
  }

  // Titres de chaque question (pour l'en-tête)
  const QUESTIONS = [
    'Comment s’appelle votre agent ?',
    'Que doit faire votre agent ?',
    'Quel ton pour votre marque ?',
    'Dans quelles langues répond-il ?',
    'En combien de temps doit-il répondre ?',
    'Quand passer la main à un humain ?',
    'Ses instructions générales',
    'Tout est prêt ✨',
  ]

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-3xl">
      {/* Progression : barre + compteur */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Étape {step + 1} sur {TOTAL}</span>
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" /> Pré-rempli depuis votre boutique</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      {/* Question courante */}
      <div className="relative flex flex-1 flex-col">
        {/* Feedback encourageant façon "blow up" */}
        {feedback && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center">
            <div className="animate-feedback-pop rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-center text-base font-semibold text-primary shadow-lg backdrop-blur">
              {feedback}
            </div>
          </div>
        )}

        <div key={step} className={cn('flex flex-1 flex-col transition-all duration-300', advancing ? 'scale-[0.98] opacity-30 blur-[1px]' : 'animate-question-enter opacity-100')}>
        <h1 className="text-xl font-semibold sm:text-2xl">{QUESTIONS[step]}</h1>

        <div className="mt-5 flex-1">
          {/* Q1 — Nom */}
          {step === 0 && (
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="Ex : Assistant de la boutique"
              className="h-12 w-full rounded-lg border border-input bg-background px-4 text-base" />
          )}

          {/* Q2 — Objectifs */}
          {step === 1 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Sélectionnez tout ce qui s’applique.</p>
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

          {/* Q3 — Ton */}
          {step === 2 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Déduit de votre boutique — ajustez si besoin.</p>
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

          {/* Q4 — Langues */}
          {step === 3 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Sélectionnez toutes les langues de vos clients.</p>
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

          {/* Q5 — Délai */}
          {step === 4 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">Un léger délai rend l’échange plus naturel (effet « humain »).</p>
              <div className="flex flex-wrap items-center gap-3 text-base">
                <span className="text-muted-foreground">Entre</span>
                <input type="number" min={0} max={60} value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                  className="h-12 w-16 rounded-lg border border-input bg-background px-2 text-center" />
                <span className="text-muted-foreground">et</span>
                <input type="number" min={0} max={60} value={delayMax}
                  onChange={(e) => setDelayMax(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                  className="h-12 w-16 rounded-lg border border-input bg-background px-2 text-center" />
                <span className="text-muted-foreground">secondes</span>
              </div>
            </>
          )}

          {/* Q6 — Transfert humain */}
          {step === 5 && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-4 text-sm font-medium">
                <input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} className="h-4 w-4 accent-primary" />
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Transférer à un conseiller humain quand c’est nécessaire</span>
              </label>
              <p className="text-xs text-muted-foreground">
                Une IA analyse chaque message : dès qu’une des situations ci-dessous survient, l’agent se désactive
                sur la conversation et vous êtes notifié pour reprendre la main depuis l’onglet <span className="font-medium text-foreground">Conversations</span>.
              </p>
              {escalation && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Situations qui déclenchent le transfert (détectées par l’IA)</label>
                  <textarea
                    value={escalationSituations}
                    onChange={(e) => setEscalationSituations(e.target.value)}
                    rows={6}
                    placeholder={"Ex : le client est mécontent ou agressif ; il menace de laisser un mauvais avis ou de porter plainte ; il demande explicitement un humain ; litige sur un remboursement supérieur à 50 € ; question à laquelle l’agent ne sait pas répondre…"}
                    className="mt-1 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-relaxed"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Laissez vide pour utiliser la détection par défaut (insultes, menaces, agressivité, demande explicite d’un humain).</p>
                </div>
              )}
            </div>
          )}

          {/* Q7 — Instructions */}
          {step === 6 && (
            <div className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Générées depuis votre boutique. Ajustez librement.</p>
                <Button variant="outline" size="sm" disabled={regenerating} onClick={() => generate(objectives)}>
                  {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  Régénérer
                </Button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full flex-1 resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-relaxed min-h-[380px]"
              />
            </div>
          )}

          {/* Q8 — Récap */}
          {step === 7 && (
            <dl className="divide-y rounded-xl border">
              {[
                { label: 'Nom', value: name || cfg.name },
                { label: 'Objectifs', value: objLabels.join(', ') || '—' },
                { label: 'Ton', value: toneLabel },
                { label: 'Langues', value: langLabels.join(', ') },
                { label: 'Délai de réponse', value: `${delayMin}–${delayMax} sec` },
                { label: 'Transfert humain', value: escalation ? 'Activé (détection IA)' : 'Désactivé' },
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
        <Button variant="ghost" size="sm" disabled={step === 0 || saving || advancing} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        {isLast ? (
          <Button disabled={saving || regenerating} onClick={activate}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Activer mon agent
          </Button>
        ) : (
          <Button disabled={advancing} onClick={goNext}>
            Suivant <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
