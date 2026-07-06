'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check, ShoppingBag, Package, Repeat, Heart, MessageSquare, ArrowLeft, ArrowRight, User, SlidersHorizontal, FileText } from 'lucide-react'
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
  const [delayMin, setDelayMin] = useState(2)
  const [delayMax, setDelayMax] = useState(5)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [step, setStep] = useState(0)

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

  if (loading) return <BlobLoaderScreen />

  const STEPS = [
    { key: 'identity', label: 'Identité', icon: User },
    { key: 'behavior', label: 'Comportement', icon: SlidersHorizontal },
    { key: 'instructions', label: 'Instructions', icon: FileText },
    { key: 'recap', label: 'Récapitulatif', icon: Check },
  ]
  const isLast = step === STEPS.length - 1
  const toneLabel = TONES.find((t) => t.key === tone)?.label || tone
  const langLabels = langs.map((k) => LANGS.find((l) => l.key === k)?.label || k)
  const objLabels = objectives.map((k) => OBJECTIVES.find((o) => o.key === k)?.label || k)

  if (!cfg) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyse de votre boutique…
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col gap-6 p-6 md:p-8">
      {/* En-tête + progression */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-primary" /> Configurons votre agent IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pré-rempli à partir de votre boutique. Quelques étapes pour vérifier et ajuster.</p>
        <div className="mt-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 flex-col gap-1.5">
              <div className={cn('h-1.5 w-full rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-muted')} />
              <span className={cn('flex items-center gap-1 text-[11px] font-medium', i === step ? 'text-foreground' : 'text-muted-foreground')}>
                <s.icon className="h-3 w-3" /> {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Contenu de l'étape */}
      <div className="flex-1 space-y-5">
        {/* ÉTAPE 1 — Identité */}
        {step === 0 && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nom de l’agent</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Que doit faire votre agent ?</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {OBJECTIVES.map((o) => {
                  const on = objectives.includes(o.key)
                  const Icon = o.icon
                  return (
                    <button key={o.key} onClick={() => toggleObjective(o.key)}
                      className={cn('flex items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
                      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ton de la marque <span className="text-xs text-muted-foreground">(déduit de votre boutique)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button key={t.key} onClick={() => setTone(t.key)}
                    className={cn('rounded-full px-3 py-1.5 text-sm transition-colors',
                      tone === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Langues des clients</label>
              <div className="flex flex-wrap gap-1.5">
                {LANGS.map((l) => (
                  <button key={l.key} onClick={() => toggleLang(l.key)}
                    className={cn('rounded-full border px-3 py-1 text-sm transition-colors',
                      langs.includes(l.key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ÉTAPE 2 — Comportement */}
        {step === 1 && (
          <>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Délai de réponse</p>
                  <p className="text-xs text-muted-foreground">Temps d’attente avant que l’agent réponde (effet « humain »).</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-sm">
                  <input type="number" min={0} max={30} value={delayMin}
                    onChange={(e) => setDelayMin(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
                    className="h-9 w-14 rounded-md border border-input bg-background px-2 text-center text-sm" />
                  <span className="text-muted-foreground">–</span>
                  <input type="number" min={0} max={30} value={delayMax}
                    onChange={(e) => setDelayMax(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
                    className="h-9 w-14 rounded-md border border-input bg-background px-2 text-center text-sm" />
                  <span className="text-xs text-muted-foreground">sec</span>
                </span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} className="h-4 w-4 accent-primary" />
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Transférer à un conseiller humain</span>
              </label>
              <p className="pl-6 text-xs text-muted-foreground">
                Une IA analyse chaque message : dès qu’une des situations que vous décrivez ci-dessous survient,
                l’agent se désactive sur la conversation et vous êtes notifié pour reprendre la main depuis
                l’onglet <span className="font-medium text-foreground">Conversations</span>.
              </p>
              {escalation && (
                <div className="pl-6 pt-1">
                  <label className="text-xs font-medium text-muted-foreground">Situations qui déclenchent le transfert (détectées par l’IA)</label>
                  <textarea
                    value={escalationSituations}
                    onChange={(e) => setEscalationSituations(e.target.value)}
                    rows={5}
                    placeholder={"Ex : le client est mécontent ou agressif ; il menace de laisser un mauvais avis ou de porter plainte ; il demande explicitement un humain ; litige sur un remboursement supérieur à 50 € ; question à laquelle l’agent ne sait pas répondre…"}
                    className="mt-1 w-full resize-y rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Laissez vide pour utiliser la détection par défaut (insultes, menaces, agressivité, demande explicite d’un humain).</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ÉTAPE 3 — Instructions */}
        {step === 2 && (
          <div className="flex h-full flex-col space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Instructions générales de l’agent</label>
              <Button variant="outline" size="sm" disabled={regenerating} onClick={() => generate(objectives)}>
                {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Régénérer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Générées à partir de votre boutique. Vous pouvez les ajuster librement.</p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full flex-1 resize-y rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed min-h-[440px]"
            />
          </div>
        )}

        {/* ÉTAPE 4 — Récapitulatif */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Vérifiez la configuration, puis activez votre agent.</p>
            <dl className="divide-y rounded-lg border">
              {[
                { label: 'Nom', value: name || cfg.name },
                { label: 'Objectifs', value: objLabels.join(', ') || '—' },
                { label: 'Ton', value: toneLabel },
                { label: 'Langues', value: langLabels.join(', ') },
                { label: 'Délai de réponse', value: `${delayMin}–${delayMax} sec` },
                { label: 'Transfert humain', value: escalation ? 'Activé (détection IA)' : 'Désactivé' },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-right text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" size="sm" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        {isLast ? (
          <Button disabled={saving || regenerating} onClick={activate}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Activer mon agent
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Suivant <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
