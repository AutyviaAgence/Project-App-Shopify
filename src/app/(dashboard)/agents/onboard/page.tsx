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
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Récupère l'agent existant (créé à la connexion) + génère la config déduite.
  useEffect(() => {
    (async () => {
      try {
        const agentsRes = await fetch('/api/agents').then((r) => r.json())
        const first = agentsRes.data?.[0]
        if (first) setAgentId(first.id)
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
        system_prompt: cfg.system_prompt,
        auto_detect_language: langs.length > 1,
        escalation_enabled: escalation,
        escalation_mode: 'both',
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Votre agent IA est prêt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Nous l’avons pré-configuré à partir de votre boutique. Vérifiez et ajustez, puis activez.</p>
      </div>

      {!cfg ? (
        <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyse de votre boutique…
        </div>
      ) : (
        <>
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

          {/* Escalade */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
            <input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} className="h-4 w-4 accent-primary" />
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span>Transférer à un conseiller humain pour les cas complexes</span>
          </label>

          {/* Aperçu du prompt (repliable) */}
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">Voir les instructions générées</summary>
            <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{cfg.system_prompt}</pre>
          </details>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" disabled={regenerating} onClick={() => generate(objectives)}>
              {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Régénérer
            </Button>
            <Button disabled={saving || regenerating} onClick={activate}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Activer mon agent
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
