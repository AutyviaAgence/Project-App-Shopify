'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check, ShoppingBag, Package, Repeat, Heart, MessageSquare } from 'lucide-react'
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-primary" /> Votre agent IA est prêt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Nous l’avons pré-configuré à partir de votre boutique. Vérifiez et ajustez, puis activez.</p>
      </div>

      {!cfg ? (
        <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyse de votre boutique…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          {/* Colonne gauche : réglages */}
          <div className="space-y-5">
          {/* Nom */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nom de l’agent</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>

          {/* Objectifs */}
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

          {/* Ton */}
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

          {/* Langues */}
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

          {/* Réponses : délai */}
          <div className="space-y-3 rounded-lg border p-3">
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

          {/* Transfert vers un conseiller humain (détection 100 % IA) */}
          <div className="space-y-2 rounded-lg border p-3">
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
                  rows={4}
                  placeholder={"Ex : le client est mécontent ou agressif ; il menace de laisser un mauvais avis ou de porter plainte ; il demande explicitement un humain ; litige sur un remboursement supérieur à 50 € ; question à laquelle l’agent ne sait pas répondre…"}
                  className="mt-1 w-full resize-y rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Laissez vide pour utiliser la détection par défaut (insultes, menaces, agressivité, demande explicite d’un humain).</p>
              </div>
            )}
          </div>
          </div>

          {/* Colonne droite : instructions générales (remplit la hauteur) */}
          <div className="space-y-1.5 lg:sticky lg:top-6">
            <label className="text-sm font-medium">Instructions générales de l’agent</label>
            <p className="text-xs text-muted-foreground">Générées à partir de votre boutique. Vous pouvez les ajuster librement.</p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed min-h-[420px] lg:h-[calc(100vh-320px)]"
            />
          </div>

          {/* Actions — pleine largeur sous les deux colonnes */}
          <div className="flex items-center justify-between border-t pt-4 lg:col-span-2">
            <Button variant="outline" size="sm" disabled={regenerating} onClick={() => generate(objectives)}>
              {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Régénérer
            </Button>
            <Button disabled={saving || regenerating} onClick={activate}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Activer mon agent
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
