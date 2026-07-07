'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Loader2, Sparkles, Check, ArrowLeft, ArrowRight, Store, MessageSquare,
  Bot, FileText, Workflow, CreditCard, ShieldCheck, PackageCheck, LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * GRAND ONBOARDING BLOQUANT (« blow up ») :
 *  1. Connexion Shopify (OBLIGATOIRE — gate)   2. Analyse de la boutique
 *  3. Connexion WhatsApp (recommandée, passable)
 *  4. Agent IA référent (validation)  5. Modèles (validation)
 *  6. Automatisations (validation)    7. Abonnement (Gratuit autorisé)
 *
 * Règle d'or : RIEN n'est créé sans validation explicite du marchand.
 * La génération IA (pack) tourne en arrière-plan pendant les étapes.
 */

type OnbState = {
  completed: boolean
  step: string | null
  shopifyLinked: boolean
  shopName: string | null
  shopDomain: string | null
  billingSource: 'shopify' | 'direct'
  storeSynced: boolean
  syncSummary: { products?: number; pages?: boolean; policies?: boolean } | null
  whatsappConnected: boolean
  agentDone: boolean
  packReady: boolean
  plan: string | null
}

type PackItem = {
  trigger: string
  templateName: string
  label: string
  category: string
  header_text: string | null
  body_text: string
  variable_keys: string[]
  sample_values: string[]
  delay_minutes: number
  automation_name: string
  description: string
}

type AgentCfg = {
  name: string; description: string; objective: string; tone: string
  languages: string[]; system_prompt: string; escalation_situations: string
}

const STEPS = ['shopify', 'sync', 'whatsapp', 'agent', 'templates', 'automations', 'plan'] as const
type Step = typeof STEPS[number]

const STEP_META: Record<Step, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  shopify: { title: 'Connectez votre boutique Shopify', icon: Store },
  sync: { title: 'Analyse de votre boutique…', icon: PackageCheck },
  whatsapp: { title: 'Connectez votre WhatsApp Business', icon: MessageSquare },
  agent: { title: 'Votre agent IA référent', icon: Bot },
  templates: { title: 'Vos modèles de messages', icon: FileText },
  automations: { title: 'Vos automatisations', icon: Workflow },
  plan: { title: 'Choisissez votre formule', icon: CreditCard },
}

const PLAN_CARDS = [
  { id: 'free', name: 'Gratuit', price: 0, desc: 'Boîte de réception + réponses manuelles. Sans IA.' },
  { id: 'starter', name: 'Starter', price: 49, desc: '550 conversations IA / mois, agent + automatisations.' },
  { id: 'pro', name: 'Growth', price: 149, desc: '1 800 conversations IA / mois, actions Shopify, multi-agents.' },
  { id: 'scale', name: 'Scale', price: 349, desc: '4 500 conversations IA / mois, support prioritaire.' },
]

const TONES = [
  { key: 'professional', label: 'Professionnel' },
  { key: 'friendly', label: 'Chaleureux' },
  { key: 'casual', label: 'Décontracté' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [state, setState] = useState<OnbState | null>(null)
  const [step, setStep] = useState<Step>('shopify')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [busy, setBusy] = useState(false)

  // Étape Shopify
  const [shopInput, setShopInput] = useState('')

  // Étape WhatsApp
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waBizId, setWaBizId] = useState('')
  const [waToken, setWaToken] = useState('')

  // Étape Agent
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentCfg, setAgentCfg] = useState<AgentCfg | null>(null)
  const [agentName, setAgentName] = useState('')
  const [agentTone, setAgentTone] = useState('friendly')
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentSituations, setAgentSituations] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)

  // Pack (modèles + automatisations)
  const [pack, setPack] = useState<PackItem[] | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [selTemplates, setSelTemplates] = useState<Set<string>>(new Set())
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({})
  const [selAutomations, setSelAutomations] = useState<Set<string>>(new Set())
  const [delays, setDelays] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const packRequested = useRef(false)
  const agentRequested = useRef(false)

  // ── État serveur (source de vérité) ─────────────────────────────────
  const fetchState = useCallback(async (): Promise<OnbState | null> => {
    try {
      const res = await fetch('/api/onboarding/state')
      if (res.status === 401) { router.replace('/login?redirect=/onboarding'); return null }
      const json = await res.json()
      setState(json)
      return json
    } catch { return null }
  }, [router])

  // Détermine l'étape de départ / reprise à partir de l'état serveur.
  function resolveStep(s: OnbState): Step {
    if (!s.shopifyLinked) return 'shopify'
    if (!s.storeSynced) return 'sync'
    const saved = s.step as Step | null
    if (saved && (STEPS as readonly string[]).includes(saved) && saved !== 'shopify' && saved !== 'sync') return saved
    if (!s.whatsappConnected) return 'whatsapp'
    if (!s.agentDone) return 'agent'
    return 'templates'
  }

  useEffect(() => {
    (async () => {
      const s = await fetchState()
      if (!s) return
      if (s.completed) { router.replace('/dashboard'); return }
      setStep(resolveStep(s))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling pendant les étapes d'attente (connexion dans un autre onglet, sync).
  useEffect(() => {
    if (step !== 'shopify' && step !== 'sync') return
    const iv = setInterval(async () => {
      const s = await fetchState()
      if (!s) return
      if (step === 'shopify' && s.shopifyLinked) setStep(s.storeSynced ? 'whatsapp' : 'sync')
      if (step === 'sync' && s.storeSynced) { flash('Boutique analysée ✓'); setStep('whatsapp') }
    }, 3500)
    return () => clearInterval(iv)
  }, [step, fetchState])

  // Dès que la boutique est synchronisée : lancer la génération du pack ET la
  // config d'agent EN ARRIÈRE-PLAN (le temps d'attente est masqué par le flow).
  useEffect(() => {
    if (!state?.shopifyLinked || !state.storeSynced) return
    if (!packRequested.current) {
      packRequested.current = true
      setPackLoading(true)
      fetch('/api/onboarding/generate-pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
        .then((r) => r.json())
        .then((json) => {
          const items: PackItem[] = json.data?.items || []
          setPack(items)
          setSelTemplates(new Set(items.map((i) => i.trigger)))
          setSelAutomations(new Set(items.map((i) => i.trigger)))
          setDelays(Object.fromEntries(items.map((i) => [i.trigger, i.delay_minutes])))
        })
        .catch(() => {})
        .finally(() => setPackLoading(false))
    }
    if (!agentRequested.current) {
      agentRequested.current = true
      setAgentLoading(true)
      Promise.all([
        fetch('/api/agents').then((r) => r.json()).catch(() => null),
        fetch('/api/agents/onboard', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectives: ['sav', 'advice', 'conversion', 'loyalty'] }),
        }).then((r) => r.json()).catch(() => null),
      ]).then(([agents, gen]) => {
        const first = agents?.data?.[0]
        if (first) setAgentId(first.id)
        const c = gen?.data as AgentCfg | undefined
        if (c) {
          setAgentCfg(c)
          setAgentName(c.name)
          setAgentTone(c.tone)
          setAgentPrompt(c.system_prompt || '')
          setAgentSituations(c.escalation_situations || '')
        }
      }).finally(() => setAgentLoading(false))
    }
  }, [state?.shopifyLinked, state?.storeSynced])

  // Reprise post-OAuth : la boutique a été installée mais le lien au compte a
  // pu se perdre en route (cookies absents au callback). Dès qu'on revient ici
  // avec une boutique en attente, on la lie depuis CETTE session.
  const pendingConnectTried = useRef(false)
  useEffect(() => {
    if (!state || state.shopifyLinked || step !== 'shopify' || pendingConnectTried.current) return
    const pending = typeof window !== 'undefined' ? localStorage.getItem('onb_pending_shop') : null
    if (!pending) return
    pendingConnectTried.current = true
    ;(async () => {
      setBusy(true)
      const r = await tryDirectConnect(pending)
      if (r === 'linked') {
        localStorage.removeItem('onb_pending_shop')
        const s = await fetchState()
        goTo(s?.storeSynced ? 'whatsapp' : 'sync', 'Boutique liée ✓')
      }
      setBusy(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, step])

  function flash(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 1300)
  }

  function goTo(next: Step, msg?: string) {
    if (msg) {
      setFeedback(msg)
      setAdvancing(true)
      setTimeout(() => {
        setStep(next); setFeedback(null); setAdvancing(false)
        fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: next }) }).catch(() => {})
      }, 1300)
    } else {
      setStep(next)
      fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: next }) }).catch(() => {})
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────

  /** Tente le lien direct (boutique déjà installée) — depuis CETTE session,
      qui est garantie authentifiée (pas de dépendance aux cookies du callback). */
  async function tryDirectConnect(shop: string): Promise<'linked' | 'not_installed' | 'error'> {
    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })
      if (res.ok || res.status === 207) return 'linked'
      if (res.status === 404) return 'not_installed'
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Impossible de lier la boutique')
      return 'error'
    } catch {
      return 'error'
    }
  }

  async function startShopifyInstall() {
    const raw = shopInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const shop = raw.endsWith('.myshopify.com') ? raw : `${raw}.myshopify.com`
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      toast.error('Domaine invalide — format attendu : maboutique.myshopify.com')
      return
    }
    // Mémorise la boutique en cours : au retour d'OAuth (quel que soit le
    // chemin), l'onboarding retentera le lien depuis sa propre session.
    localStorage.setItem('onb_pending_shop', shop)
    setBusy(true)
    // App déjà installée ? Lien immédiat, sans repasser par OAuth.
    const direct = await tryDirectConnect(shop)
    if (direct === 'linked') {
      localStorage.removeItem('onb_pending_shop')
      const s = await fetchState()
      setBusy(false)
      goTo(s?.storeSynced ? 'whatsapp' : 'sync', 'Boutique liée ✓')
      return
    }
    if (direct === 'error') { setBusy(false); return }
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`
  }

  async function connectWhatsApp() {
    if (!waPhoneId.trim() || !waBizId.trim() || !waToken.trim()) {
      toast.error('Les 3 champs WhatsApp Business sont requis')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_type: 'waba',
          waba_phone_number_id: waPhoneId.trim(),
          waba_business_account_id: waBizId.trim(),
          waba_access_token: waToken.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchState()
      goTo('agent', 'WhatsApp connecté ✓')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function validateAgent() {
    if (!agentCfg) return
    setBusy(true)
    try {
      const body = {
        name: agentName.trim() || agentCfg.name,
        description: agentCfg.description,
        objective: agentCfg.objective,
        system_prompt: agentPrompt.trim() || agentCfg.system_prompt,
        auto_detect_language: (agentCfg.languages?.length || 1) > 1,
        escalation_enabled: true,
        escalation_mode: 'ai',
        escalation_situations: agentSituations.trim() || null,
        is_active: true,
        is_default: true, // agent RÉFÉRENT
      }
      const res = agentId
        ? await fetch(`/api/agents/${agentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_onboarding_done: true }) }).catch(() => {})
      goTo('templates', 'Agent référent activé 🤖')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function validateTemplates() {
    if (!pack) return
    setBusy(true)
    try {
      const edited = Object.entries(editedBodies).map(([trigger, body_text]) => ({ trigger, body_text }))
      const res = await fetch('/api/onboarding/apply-pack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: Array.from(selTemplates), edited }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      goTo('automations', `${json.data?.templatesCreated ?? selTemplates.size} modèles créés ✓`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function validateAutomations() {
    if (!pack) return
    setBusy(true)
    try {
      const automations = Array.from(selAutomations).map((trigger) => ({ trigger, delay_minutes: delays[trigger] ?? 0 }))
      const res = await fetch('/api/onboarding/apply-pack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automations }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      goTo('plan', `${json.data?.automationsCreated ?? automations.length} automatisations prêtes ⚡`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function choosePlan(planId: string) {
    setBusy(true)
    try {
      if (planId === 'free') {
        await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) })
        toast.success('Bienvenue ! Votre espace est prêt 🎉')
        router.replace('/dashboard')
        return
      }
      if (state?.billingSource === 'shopify' && state.shopDomain) {
        const res = await fetch('/api/shopify/billing/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop: state.shopDomain, plan: planId }),
        })
        const json = await res.json()
        if (!res.ok || !json.confirmationUrl) throw new Error(json.error || 'Erreur de facturation Shopify')
        // Marque terminé AVANT la redirection : au retour, plus de gate.
        await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) })
        window.location.href = json.confirmationUrl
        return
      }
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error || 'Erreur de paiement')
      await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) })
      window.location.href = json.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setBusy(false)
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────
  const stepIndex = STEPS.indexOf(step)
  const Icon = STEP_META[step].icon

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const groups: Record<string, string[]> = {
    Commande: ['order_created', 'order_paid', 'order_fulfilled', 'order_delivered', 'order_cancelled', 'refund_created', 'return_requested', 'checkout_abandoned'],
    Contact: ['contact_opted_in', 'optin_popup'],
    Conversation: ['button_clicked', 'message_read', 'no_customer_reply'],
    Planifié: ['scheduled_date', 'customer_birthday'],
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-4xl">
        {/* En-tête + progression */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Étape {stepIndex + 1} sur {STEPS.length}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                {state.shopName ? `Boutique : ${state.shopName}` : 'Configuration de votre espace'}
              </span>
              {/* Sortie de secours : changer de compte sans être enfermé par le gate */}
              <button
                onClick={async () => { await createClient().auth.signOut(); window.location.href = '/login' }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3 w-3" /> Se déconnecter
              </button>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {/* Contenu de l'étape */}
        <div className="relative flex flex-1 flex-col">
          {feedback && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center">
              <div className="animate-feedback-pop rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-center text-base font-semibold text-primary shadow-lg backdrop-blur">
                {feedback}
              </div>
            </div>
          )}

          <div key={step} className={cn('flex flex-1 flex-col justify-center transition-all duration-300', advancing ? 'scale-[0.98] opacity-30 blur-[1px]' : 'animate-question-enter opacity-100')}>
            <h1 className="flex items-center gap-2.5 text-xl font-semibold sm:text-2xl md:text-3xl">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
              {STEP_META[step].title}
            </h1>

            <div className="mt-6">
              {/* ── 1. SHOPIFY (bloquant) ── */}
              {step === 'shopify' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Xeyo se configure à partir de votre boutique (catalogue, politiques, pages).
                    <span className="font-medium text-foreground"> Cette étape est indispensable.</span>
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={shopInput} onChange={(e) => setShopInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !busy) startShopifyInstall() }}
                      placeholder="maboutique.myshopify.com" disabled={busy}
                      className="h-12 flex-1 rounded-lg border border-input bg-background px-4 text-base" />
                    <Button size="lg" className="h-12" disabled={busy} onClick={startShopifyInstall}>
                      {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Connexion…</> : <>Connecter Shopify <ArrowRight className="ml-1 h-4 w-4" /></>}
                    </Button>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Vous serez redirigé vers Shopify pour autoriser l’application, puis ramené ici automatiquement.
                  </p>
                  <p className="text-xs text-muted-foreground">Déjà installée depuis l’App Store ? Cette page se mettra à jour toute seule dès que la boutique est liée.</p>
                </div>
              )}

              {/* ── 2. SYNC (attente animée, progression réelle) ── */}
              {step === 'sync' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Nous récupérons tout ce qu’il faut pour personnaliser votre espace.</p>
                  <div className="space-y-2.5 rounded-xl border p-5">
                    {[
                      { label: 'Boutique liée', done: true },
                      { label: `Catalogue produits${state.syncSummary?.products ? ` — ${state.syncSummary.products} produits` : ''}`, done: Boolean(state.syncSummary?.products) },
                      { label: 'Pages du site', done: Boolean(state.syncSummary?.pages) },
                      { label: 'Politiques (retours, remboursements…)', done: Boolean(state.syncSummary?.policies) },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center gap-2.5 text-sm">
                        {row.done
                          ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"><Check className="h-3 w-3" /></span>
                          : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                        <span className={row.done ? 'text-foreground' : 'text-muted-foreground'}>{row.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Pendant ce temps, l’IA prépare déjà vos messages et votre agent en coulisses ✨</p>
                </div>
              )}

              {/* ── 3. WHATSAPP (recommandé, passable) ── */}
              {step === 'whatsapp' && (
                <div className="space-y-4">
                  {state.whatsappConnected ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                      <Check className="h-4 w-4 text-emerald-500" /> WhatsApp est déjà connecté.
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Renseignez vos identifiants Meta (WhatsApp Cloud API). Sans WhatsApp, vos messages et automatisations seront prêts mais <span className="font-medium text-foreground">rien ne pourra partir</span>.
                      </p>
                      <div className="space-y-2.5">
                        <input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="Phone Number ID"
                          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                        <input value={waBizId} onChange={(e) => setWaBizId(e.target.value)} placeholder="Business Account ID (WABA)"
                          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                        <input value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder="Access Token (Meta)" type="password"
                          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => goTo('agent')}>
                      Passer pour l’instant
                    </Button>
                    {state.whatsappConnected ? (
                      <Button onClick={() => goTo('agent', 'WhatsApp prêt ✓')}>Continuer <ArrowRight className="ml-1 h-4 w-4" /></Button>
                    ) : (
                      <Button disabled={busy} onClick={connectWhatsApp}>
                        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1 h-4 w-4" />}
                        Connecter WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* ── 4. AGENT RÉFÉRENT (validation) ── */}
              {step === 'agent' && (
                <div className="space-y-4">
                  {agentLoading || !agentCfg ? (
                    <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> L’IA prépare votre agent à partir de la boutique…
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Déduit de votre boutique — vérifiez, ajustez, validez. Ce sera votre <span className="font-medium text-foreground">agent référent</span>.</p>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Nom</label>
                        <input value={agentName} onChange={(e) => setAgentName(e.target.value)}
                          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Ton</label>
                        <div className="flex flex-wrap gap-1.5">
                          {TONES.map((t) => (
                            <button key={t.key} onClick={() => setAgentTone(t.key)}
                              className={cn('rounded-full px-3 py-1.5 text-sm transition-colors',
                                agentTone === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Situations de transfert à un humain <span className="text-xs text-muted-foreground">(détection IA)</span></label>
                        <textarea value={agentSituations} onChange={(e) => setAgentSituations(e.target.value)} rows={3}
                          className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-xs leading-relaxed" />
                      </div>
                      <details className="rounded-lg border p-3 text-sm">
                        <summary className="cursor-pointer font-medium text-muted-foreground">Instructions générales (modifiables)</summary>
                        <textarea value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} rows={10}
                          className="mt-2 w-full resize-y rounded-lg border border-input bg-background p-2.5 font-mono text-xs leading-relaxed" />
                      </details>
                      <div className="flex justify-end">
                        <Button disabled={busy} onClick={validateAgent}>
                          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                          Valider mon agent
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── 5. MODÈLES (validation) ── */}
              {step === 'templates' && (
                <div className="space-y-4">
                  {packLoading || !pack ? (
                    <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Rédaction de vos {15} modèles personnalisés…
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Un modèle par événement, rédigé au ton de <span className="font-medium text-foreground">{state.shopName}</span>. Décochez ce que vous ne voulez pas, cliquez pour relire/modifier. <span className="font-medium text-foreground">Rien n’est créé avant votre validation.</span>
                      </p>
                      <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                        {pack.map((item, idx) => {
                          const on = selTemplates.has(item.trigger)
                          const isOpen = expanded === item.trigger
                          return (
                            <div key={item.trigger} style={{ animationDelay: `${idx * 40}ms` }}
                              className={cn('animate-question-enter rounded-xl border transition-colors', on ? 'border-primary/40' : 'border-border opacity-60')}>
                              <div className="flex items-center gap-2.5 p-3">
                                <input type="checkbox" checked={on} className="h-4 w-4 shrink-0 accent-primary"
                                  onChange={() => setSelTemplates((prev) => { const s = new Set(prev); if (s.has(item.trigger)) s.delete(item.trigger); else s.add(item.trigger); return s })} />
                                <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : item.trigger)}>
                                  <p className="truncate text-sm font-medium">{item.label}</p>
                                  <p className="truncate text-xs text-muted-foreground">{(editedBodies[item.trigger] ?? item.body_text).slice(0, 90)}…</p>
                                </button>
                                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', item.category === 'UTILITY' ? 'bg-sky-500/10 text-sky-500' : 'bg-violet-500/10 text-violet-500')}>
                                  {item.category === 'UTILITY' ? 'Transactionnel' : 'Marketing'}
                                </span>
                              </div>
                              {isOpen && (
                                <div className="border-t p-3">
                                  <textarea
                                    value={editedBodies[item.trigger] ?? item.body_text}
                                    onChange={(e) => setEditedBodies((prev) => ({ ...prev, [item.trigger]: e.target.value }))}
                                    rows={3}
                                    className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-xs leading-relaxed"
                                  />
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Variables : {item.variable_keys.map((k, i) => `{{${i + 1}}} = ${k}`).join(' · ')}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{selTemplates.size} / {pack.length} sélectionnés</p>
                        <Button disabled={busy || selTemplates.size === 0} onClick={validateTemplates}>
                          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                          Valider ces modèles
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── 6. AUTOMATISATIONS (validation) ── */}
              {step === 'automations' && (
                <div className="space-y-4">
                  {!pack ? (
                    <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Préparation…
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Chaque automatisation envoie son modèle au bon moment. Elles seront créées <span className="font-medium text-foreground">désactivées</span> : vous les activez quand vous êtes prêt.
                      </p>
                      <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
                        {Object.entries(groups).map(([group, triggers]) => (
                          <div key={group}>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                            <div className="space-y-2">
                              {pack.filter((i) => triggers.includes(i.trigger)).map((item) => {
                                const on = selAutomations.has(item.trigger)
                                return (
                                  <div key={item.trigger} className={cn('flex items-center gap-2.5 rounded-xl border p-3 transition-colors', on ? 'border-primary/40' : 'border-border opacity-60')}>
                                    <input type="checkbox" checked={on} className="h-4 w-4 shrink-0 accent-primary"
                                      onChange={() => setSelAutomations((prev) => { const s = new Set(prev); if (s.has(item.trigger)) s.delete(item.trigger); else s.add(item.trigger); return s })} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">{item.automation_name}</p>
                                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                      délai
                                      <input type="number" min={0} value={delays[item.trigger] ?? 0}
                                        onChange={(e) => setDelays((prev) => ({ ...prev, [item.trigger]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-center text-xs" />
                                      min
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{selAutomations.size} / {pack.length} sélectionnées</p>
                        <Button disabled={busy} onClick={validateAutomations}>
                          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                          Valider ces automatisations
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── 7. ABONNEMENT (Gratuit autorisé) ── */}
              {step === 'plan' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Dernière étape ! Choisissez la formule qui correspond à votre volume — vous pourrez changer à tout moment.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {PLAN_CARDS.map((p) => (
                      <button key={p.id} disabled={busy} onClick={() => choosePlan(p.id)}
                        className={cn('group flex flex-col rounded-2xl border p-4 text-left transition-all hover:border-primary hover:shadow-md hover:shadow-primary/10',
                          p.id === 'pro' && 'border-primary/50 bg-primary/5')}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{p.name}</span>
                          {p.id === 'pro' && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Populaire</span>}
                        </div>
                        <p className="mt-1 text-2xl font-bold">{p.price} €<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
                        <p className="mt-1.5 text-xs text-muted-foreground">{p.desc}</p>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                          {p.id === 'free' ? 'Commencer gratuitement' : 'Choisir'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation retour (pas sur les étapes bloquantes/attente) */}
        {step !== 'shopify' && step !== 'sync' && (
          <div className="flex items-center border-t pt-4">
            <Button variant="ghost" size="sm" disabled={busy || advancing || stepIndex <= 2}
              onClick={() => setStep(STEPS[Math.max(2, stepIndex - 1)])}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Retour
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
