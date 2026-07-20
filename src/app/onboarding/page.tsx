'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SHOPIFY_APP_STORE_URL } from '@/lib/shopify/app-store'
import { triggersForKind } from '@/lib/automations/types'
import { Button } from '@/components/ui/button'
import {
  Loader2, Sparkles, Check, ArrowLeft, ArrowRight, Store, MessageSquare,
  Bot, FileText, Workflow, CreditCard, ShieldCheck, PackageCheck, LogOut,
  AlertTriangle, Package, UserPlus, CalendarClock, ChevronDown,
  ToggleRight, ExternalLink, MessageCircle, PartyPopper,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MascotRunner } from '@/components/mascot-runner'
import { OnboardingFeedback } from '@/components/onboarding-feedback'
import { AgentTryChat } from '@/components/onboarding/agent-try-chat'
import { WhatsAppEmbeddedSignup, embeddedSignupAvailable } from '@/components/whatsapp-embedded-signup'
import { WelcomeScreen } from '@/components/onboarding/welcome-screen'
import { TemplateSwiper, type SwipeGroup } from '@/components/onboarding/template-swiper'
import { ModuleIntro, type IntroModule } from '@/components/onboarding/module-intro'
import { ThemeEditorDemo } from '@/components/onboarding/theme-editor-demo'
import { PricingGlass, type TierType } from '@/components/ui/pricing-glass'
import { PLANS, PAID_PLANS, ANNUAL_DISCOUNT } from '@/lib/plans'
import { track, identifyMerchant } from '@/lib/posthog/events'
import { AnimatePresence, motion } from 'framer-motion'

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
  buttons?: { type: string; text: string; url?: string }[] | null
  template_type?: 'standard' | 'carousel'
  carousel_cards?: { header_media_url: string | null; body_text: string }[] | null
}

type AgentCfg = {
  name: string; description: string; objective: string; tone: string
  languages: string[]; system_prompt: string; escalation_situations: string
  sample_questions?: string[]
}

// L'activation des blocs de thème vient APRÈS la connexion WhatsApp : les blocs
// (bulle, popup) ne s'affichent sur la boutique QUE si un numéro est connecté
// (cf. /api/shopify/proxy/widget). Les proposer avant serait trompeur.
const STEPS = ['shopify', 'sync', 'whatsapp', 'widget', 'agent', 'templates', 'automations', 'plan'] as const
type Step = typeof STEPS[number]

const STEP_META: Record<Step, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  shopify: { title: 'Connectez votre boutique Shopify', icon: Store },
  sync: { title: 'Analyse de votre boutique…', icon: PackageCheck },
  widget: { title: 'Activez Xeyo sur votre boutique', icon: ToggleRight },
  whatsapp: { title: 'Connectez votre WhatsApp Business', icon: MessageSquare },
  agent: { title: 'Votre agent IA référent', icon: Bot },
  templates: { title: 'Vos modèles de messages', icon: FileText },
  automations: { title: 'Vos automatisations', icon: Workflow },
  plan: { title: 'Choisissez votre formule', icon: CreditCard },
}

// Fiche d'identité de chaque CATÉGORIE d'automatisations : ce que ça fait,
// dit simplement + un exemple concret — la personne ne lira pas 15 lignes.
const CATEGORY_META: Record<string, { title: string; icon: React.ComponentType<{ className?: string }>; pitch: string; example: string }> = {
  Commande: {
    title: 'Commandes',
    icon: Package,
    pitch: 'Informe vos clients à chaque étape : confirmation, paiement, expédition, livraison, remboursement.',
    example: 'Ex. : commande expédiée → Marie reçoit son lien de suivi, automatiquement.',
  },
  Contact: {
    title: 'Contacts',
    icon: UserPlus,
    pitch: 'Accueille chaque nouveau contact et transforme les visiteurs en abonnés WhatsApp.',
    example: 'Ex. : nouvel inscrit → message de bienvenue immédiat.',
  },
  Conversation: {
    title: 'Conversation',
    icon: MessageSquare,
    pitch: 'Réagit à ce qui se passe dans la discussion : clics sur un bouton, silences, messages lus.',
    example: 'Ex. : pas de réponse depuis 24 h → relance polie.',
  },
  Planifié: {
    title: 'Planification (marketing)',
    icon: CalendarClock,
    pitch: 'Envois programmés pour fidéliser : anniversaires, dates clés, campagnes.',
    example: 'Ex. : anniversaire → vœux + code promo personnalisé.',
  },
}

// Tiers de l'écran d'abonnement (dérivés de la SOURCE DE VÉRITÉ `PLANS`).
// Le composant PricingGlass est sur 3 colonnes : on y met les 3 plans payants,
// le plan Gratuit restant proposé en lien discret sous les cartes.
// Tarif annuel = -20 % du mensuel (arrondi), cohérent avec le badge du toggle.
const PLAN_DESC: Record<string, string> = {
  starter: 'Pour démarrer avec un agent IA autonome sur WhatsApp.',
  pro: 'Pour les boutiques qui veulent automatiser leur SAV et leurs ventes.',
  scale: 'Pour un volume élevé, avec le meilleur modèle et un support prioritaire.',
}
const PRICING_TIERS: TierType[] = PAID_PLANS.map((id) => {
  const p = PLANS[id]
  return {
    id: p.id,
    name: p.name,
    priceMonthly: String(p.priceEur),
    // Prix annuel affiché « par mois » (facturé annuellement) : mensuel -20 %.
    priceAnnual: String(Math.round(p.priceEur * (1 - ANNUAL_DISCOUNT))),
    description: PLAN_DESC[p.id] ?? '',
    isPopular: p.id === 'pro',
    features: p.features,
    cta: 'Choisir ce plan',
  }
})

export default function OnboardingPage() {
  const router = useRouter()
  const [state, setState] = useState<OnbState | null>(null)
  const [step, setStep] = useState<Step>('shopify')
  // Écran de bienvenue : affiché une seule fois, au tout premier passage.
  // Marqué en localStorage — un rechargement ou un retour ne le rejoue pas.
  const [showWelcome, setShowWelcome] = useState(false)
  // Carte de validation entre deux étapes : message + étape suivante annoncée.
  const [feedback, setFeedback] = useState<{ message: string; next?: string } | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [busy, setBusy] = useState(false)
  // Plan en cours de souscription (spinner sur la carte concernée).
  const [planLoading, setPlanLoading] = useState<string | null>(null)
  // Code promo (étape « plan »). Replié par défaut.
  const [promoCode, setPromoCode] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  // Intros animées « c'est quoi ce module ? » : vues une fois par étape
  // (état de session — revenir en arrière ne les rejoue pas).
  const [seenIntros, setSeenIntros] = useState<Set<IntroModule>>(new Set())

  // Étape WhatsApp
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waBizId, setWaBizId] = useState('')
  const [waToken, setWaToken] = useState('')

  // Étape Agent
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentCfg, setAgentCfg] = useState<AgentCfg | null>(null)
  const [agentName, setAgentName] = useState('')
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
    // WhatsApp d'abord : sans numéro connecté, les blocs de thème (bulle, popup)
    // ne s'affichent pas sur la boutique → l'étape widget vient ensuite.
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

      // ⚠️ L'onboarding est HORS du layout dashboard (qui identifie le marchand) :
      // sans ça, TOUT le funnel d'onboarding serait anonyme. On identifie donc ici,
      // pour relier chaque étape au compte. Puis on marque le début du funnel.
      try {
        const { data: { user } } = await createClient().auth.getUser()
        if (user) identifyMerchant(user.id, { email: user.email })
      } catch { /* no-op */ }
      track('onboarding_started', { resume_step: resolveStep(s) })
      // Bienvenue :
      //  - FORCÉE juste après l'acceptation des CGU (flag `xeyo_show_welcome`
      //    posé par /register/complete) — c'est le vrai « je viens de m'inscrire » ;
      //  - sinon, au tout premier passage avant toute action (boutique pas encore
      //    liée et animation jamais vue).
      const forced = localStorage.getItem('xeyo_show_welcome') === '1'
      if (forced || (!s.shopifyLinked && !localStorage.getItem('xeyo_welcome_seen'))) {
        setShowWelcome(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Funnel : chaque étape vue (avec son index) — c'est ce qui permet de voir
  // dans PostHog À QUELLE étape les marchands décrochent. Ne se déclenche pas
  // tant que l'écran de bienvenue est affiché (l'étape n'est pas encore « vue »).
  useEffect(() => {
    if (showWelcome) return
    track('onboarding_step_viewed', { step, index: STEPS.indexOf(step) })
  }, [step, showWelcome])

  // Polling pendant les étapes d'attente (connexion dans un autre onglet, sync).
  useEffect(() => {
    if (step !== 'shopify' && step !== 'sync') return
    const iv = setInterval(async () => {
      const s = await fetchState()
      if (!s) return
      if (step === 'shopify' && s.shopifyLinked) setStep(s.storeSynced ? 'whatsapp' : 'sync')
      if (step === 'sync' && s.storeSynced) { flash('Boutique analysée'); setStep('whatsapp') }
    }, 3500)
    return () => clearInterval(iv)
  }, [step, fetchState])

  // Générations en arrière-plan (relançables en cas d'échec).
  function loadPack() {
    setPackLoading(true)
    fetch('/api/onboarding/generate-pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then((r) => r.json())
      .then((json) => {
        const items: PackItem[] = json.data?.items || []
        if (items.length === 0) throw new Error(json.error || 'Pack vide')
        setPack(items)
        setSelTemplates(new Set(items.map((i) => i.trigger)))
        setSelAutomations(new Set(items.map((i) => i.trigger)))
        setDelays(Object.fromEntries(items.map((i) => [i.trigger, i.delay_minutes])))
      })
      .catch((e) => { setPack(null); toast.error(e instanceof Error ? e.message : 'Génération des modèles indisponible') })
      .finally(() => setPackLoading(false))
  }

  function loadAgentCfg() {
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
        setAgentPrompt(c.system_prompt || '')
        setAgentSituations(c.escalation_situations || '')
      } else if (gen?.error) {
        toast.error(gen.error)
      }
    }).finally(() => setAgentLoading(false))
  }

  // Dès que la boutique est synchronisée : lancer la génération du pack ET la
  // config d'agent EN ARRIÈRE-PLAN (le temps d'attente est masqué par le flow).
  useEffect(() => {
    if (!state?.shopifyLinked || !state.storeSynced) return
    if (!packRequested.current) { packRequested.current = true; loadPack() }
    if (!agentRequested.current) { agentRequested.current = true; loadAgentCfg() }
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
        goTo(s?.storeSynced ? 'whatsapp' : 'sync', 'Boutique liée')
      }
      setBusy(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, step])

  // 2600 ms : le temps de LIRE la carte (chute + rebond + barre intégrée).
  const FEEDBACK_MS = 2600

  function flash(msg: string) {
    setFeedback({ message: msg })
    setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }

  function goTo(next: Step, msg?: string) {
    // Étape validée : on émet l'étape QU'ON QUITTE (celle qui vient d'être
    // complétée) → funnel de complétion, complémentaire de step_viewed.
    track('onboarding_step_completed', { from: step, to: next, index: STEPS.indexOf(step) })
    if (msg) {
      // La carte annonce aussi l'étape suivante (« Étape suivante : … »).
      setFeedback({ message: msg, next: STEP_META[next].title })
      setAdvancing(true)
      setTimeout(() => {
        setStep(next); setFeedback(null); setAdvancing(false)
        fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: next }) }).catch(() => {})
      }, FEEDBACK_MS)
    } else {
      setStep(next)
      fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: next }) }).catch(() => {})
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────

  /** Tente le lien direct (boutique déjà installée) — depuis CETTE session,
      qui est garantie authentifiée (pas de dépendance aux cookies du callback). */
  async function tryDirectConnect(shop: string): Promise<'linked' | 'not_installed' | 'taken' | 'error'> {
    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })
      if (res.ok || res.status === 207) return 'linked'
      if (res.status === 404) return 'not_installed'
      // 409 : la boutique appartient déjà à un autre compte → on ne retente pas d'installer.
      if (res.status === 409) {
        localStorage.removeItem('onb_pending_shop')
        return 'taken'
      }
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Impossible de lier la boutique')
      return 'error'
    } catch {
      return 'error'
    }
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
      goTo('widget', 'WhatsApp connecté')
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
        onboarding: true, // upsert idempotent côté serveur (anti-doublon)
      }
      const res = agentId
        ? await fetch(`/api/agents/${agentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_onboarding_done: true }) }).catch(() => {})
      goTo('templates', 'Agent référent activé')
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
      goTo('automations', `${json.data?.templatesCreated ?? selTemplates.size} modèles prêts`)
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
      goTo('plan', `${json.data?.automationsCreated ?? automations.length} automatisations prêtes`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function choosePlan(planId: string, billing: 'monthly' | 'annual' = 'monthly') {
    setBusy(true)
    setPlanLoading(planId)
    try {
      // Abonnement OBLIGATOIRE : plus de plan Gratuit. Tout parcours passe par un
      // plan payant (7 jours d'essai). Garde défensive au cas où un 'free' arriverait.
      if (planId === 'free' || !PAID_PLANS.includes(planId as (typeof PAID_PLANS)[number])) {
        toast.error('Veuillez choisir une formule.')
        setBusy(false)
        setPlanLoading(null)
        return
      }
      // FACTURATION 100 % SHOPIFY : l'onboarding impose une boutique Shopify, donc
      // toute souscription passe par la Billing API. Plus de fallback Stripe.
      if (!(state?.billingSource === 'shopify' && state.shopDomain)) {
        throw new Error("Aucune boutique Shopify liée. Rouvrez l'application depuis votre admin Shopify.")
      }
      const res = await fetch('/api/shopify/billing/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `promo_code` seulement s'il est renseigné : la route refuse un code vide.
        body: JSON.stringify({
          shop: state.shopDomain,
          plan: planId,
          billing,
          // Ramène à l'onboarding si le marchand annule sur l'écran Shopify.
          origin: 'onboarding',
          ...(promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
        }),
      })
      const json = await res.json()
      // La route renvoie { data: { confirmationUrl } } — on lisait json.confirmationUrl
      // (non imbriqué) → le flux Shopify jetait systématiquement « Erreur de
      // facturation Shopify », même quand l'abonnement était bien créé.
      const confirmationUrl = json?.data?.confirmationUrl
      if (!res.ok || !confirmationUrl) throw new Error(json.error || 'Erreur de facturation Shopify')
      // Onboarding terminé : le marchand a choisi une formule et part vers la
      // page d'approbation Shopify. Fin du funnel (avec plan + intervalle).
      track('onboarding_completed', { plan: planId, billing })
      // Marque terminé AVANT la redirection : au retour, plus de gate.
      await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }) })
      window.location.href = confirmationUrl
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setBusy(false)
      setPlanLoading(null)
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────
  const stepIndex = STEPS.indexOf(step)
  const Icon = STEP_META[step].icon
  // Intro de module en cours : on masque le titre d'étape et le panneau verre
  // (l'animation joue en pleine scène, comme l'accueil).
  const showingIntro =
    (step === 'agent' || step === 'templates' || step === 'automations') && !seenIntros.has(step)

  if (!state) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#0a0f1e]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  // Écran de bienvenue : un seul passage, puis on entre dans les étapes.
  // Fond sombre propre à la scène (elle porte son propre bg cinématique).
  if (showWelcome) {
    return (
      <div className="dark min-h-screen bg-[#0a0f1e]">
        <WelcomeScreen
          onStart={() => {
            // Vue : on marque et on lève le flag « forcée » pour ne pas rejouer.
            localStorage.setItem('xeyo_welcome_seen', '1')
            localStorage.removeItem('xeyo_show_welcome')
            setShowWelcome(false)
          }}
        />
      </div>
    )
  }

  // ⚠️ Les déclencheurs viennent de `triggersForKind`, pas d'une liste écrite ici.
  //
  // Cette liste était figée : elle proposait encore `button_clicked` après son
  // retrait (devenu redondant — un message à boutons branche déjà ses sorties
  // dans le parcours). Toute liste dupliquée finit par mentir ; on filtre donc
  // sur la source de vérité.
  const offered = new Set<string>([
    ...triggersForKind('marketing').map((e) => e.value as string),
    ...triggersForKind('transactional').map((e) => e.value as string),
  ])
  const groups: Record<string, string[]> = Object.fromEntries(
    Object.entries({
      Commande: ['order_created', 'order_paid', 'order_fulfilled', 'order_delivered', 'order_cancelled', 'refund_created', 'return_requested'],
      Contact: ['contact_opted_in', 'optin_popup'],
      Conversation: ['message_read', 'no_customer_reply'],
      Planifié: ['scheduled_date', 'customer_birthday', 'checkout_abandoned'],
    }).map(([k, v]) => [k, v.filter((t) => offered.has(t))])
  )
  // Les 4 familles rangées sous les 2 onglets réels de l'app : Transactionnel
  // (statuts de commande) vs Campagnes marketing (le reste). Le panier abandonné
  // (relance) est une campagne → dans « Planifié ». Aligne l'onboarding sur la
  // séparation Campagnes/Transactionnel et sur kindForTrigger.
  const FAMILIES: { key: 'transactional' | 'marketing'; title: string; pitch: string; cats: string[] }[] = [
    { key: 'transactional', title: 'Transactionnel', pitch: 'Messages automatiques liés aux commandes (confirmation, expédition, SAV). Envoyés quoi qu’il arrive.', cats: ['Commande'] },
    { key: 'marketing', title: 'Campagnes marketing', pitch: 'Bienvenue, relances, anniversaires, planifié… Pour engager et fidéliser (soumis aux règles anti-spam).', cats: ['Contact', 'Conversation', 'Planifié'] },
  ]

  // Cartes du swiper de modèles : un GROUPE par carte (+ « Autres » pour les
  // triggers hors mapping, pour ne jamais en perdre).
  const groupedTriggers = new Set(Object.values(groups).flat())
  const swipeGroups: SwipeGroup[] = pack
    ? [
        ...Object.entries(groups).map(([key, triggers]) => ({
          key,
          title: CATEGORY_META[key]?.title ?? key,
          pitch: CATEGORY_META[key]?.pitch,
          items: pack.filter((i) => triggers.includes(i.trigger)),
        })),
        { key: 'Autres', title: 'Autres', items: pack.filter((i) => !groupedTriggers.has(i.trigger)) },
      ].filter((g) => g.items.length > 0)
    : []

  return (
    // Thème sombre FORCÉ (classe `dark`) : tout l'onboarding vit dans la même
    // scène que l'écran de bienvenue — fond bleu nuit, halo, grille, verre.
    <div className="dark relative min-h-screen overflow-x-hidden bg-[#0a0f1e] text-foreground">
      {/* Couches cinématiques (identiques au WelcomeScreen). `fixed` : elles
          couvrent le viewport même quand le contenu scrolle. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(60% 55% at 50% 30%, #16264d 0%, #0b1122 55%, #060912 100%)' }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#4d6bff 1px, transparent 1px), linear-gradient(90deg, #4d6bff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(70% 60% at 50% 35%, black, transparent)',
        }}
      />
      {/* Mot fantôme, très discret, en continuité avec l'intro. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-6 -translate-x-1/2 select-none text-[11rem] font-black leading-none tracking-tighter text-white opacity-[0.025]"
      >
        XEYO.IO
      </div>

      <div className={cn(
        'relative z-10 mx-auto flex min-h-screen w-full flex-col gap-6 px-4 py-8 sm:px-6',
        // L'étape « plan » affiche 3 cartes larges : on élargit le conteneur.
        step === 'plan' ? 'max-w-3xl lg:max-w-6xl' : 'max-w-3xl lg:max-w-4xl',
      )}>
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
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            {/* Progression animée par motion (spring) + dégradé lumineux. */}
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary via-sky-400 to-primary shadow-[0_0_12px_1px] shadow-primary/50"
              initial={false}
              animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
        </div>

        {/* Contenu de l'étape */}
        <div className="relative flex flex-1 flex-col">
          <OnboardingFeedback feedback={feedback} />

          <div key={step} className={cn('flex flex-1 flex-col justify-center transition-opacity duration-200', advancing ? 'opacity-0' : 'animate-question-enter opacity-100')}>
            {!showingIntro && (
            <h1 className="flex items-center gap-2.5 text-xl font-semibold sm:text-2xl md:text-3xl">
              {/* Pastille d'icône : pop (spring) à chaque changement d'étape. */}
              <motion.span
                key={step}
                initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[0_0_20px_-4px]',
                  // Étapes de marque : logo réel sur fond blanc (les logos ont
                  // leurs propres couleurs, un fond teinté les dénaturerait).
                  step === 'shopify' || step === 'whatsapp'
                    ? 'border-black/5 bg-white shadow-primary/20'
                    : 'border-primary/20 bg-primary/15 text-primary shadow-primary/40',
                )}
              >
                {step === 'shopify' ? (
                  <Image src="/brand/shopify-logo.png" alt="Shopify" width={24} height={24} className="h-6 w-6" />
                ) : step === 'whatsapp' ? (
                  <Image src="/brand/whatsapp-logo.webp" alt="WhatsApp" width={26} height={26} className="h-[26px] w-[26px]" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </motion.span>
              {STEP_META[step].title}
            </h1>
            )}

            {/* Transition entre étapes : la sortante glisse et s'efface avant que
                l'entrante n'apparaisse (`mode="wait"`). La `key` est l'étape —
                sans elle, AnimatePresence ne verrait aucun changement. */}
            <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className={cn(
                'mt-6',
                // Panneau « verre » (même langage que l'intro). Pas sur l'étape
                // plan : les cartes PricingGlass portent déjà leur propre verre.
                // Pas de panneau verre pendant une INTRO de module : elle joue
                // en pleine scène, comme l'accueil.
                step !== 'plan' && !showingIntro &&
                  'rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-md sm:p-6',
                // La mascotte (à droite du panneau) déborde ~140px dessous :
                // juste assez de réserve pour que « Retour » reste sous sa
                // ligne de sol, sans repousser le pied de page trop bas.
                step === 'agent' && !showingIntro && 'lg:mb-36',
              )}
              initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -24, filter: 'blur(6px)' }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
            >
              {/* ── 1. SHOPIFY (bloquant) ── */}
              {step === 'shopify' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Xeyo se configure à partir de votre boutique (catalogue, politiques, pages).
                    <span className="font-medium text-foreground"> Cette étape est indispensable.</span>
                  </p>
                  {/*
                    ⚠️ Exigence App Store 2.3.1 : PAS de champ où le marchand tape son
                    domaine `.myshopify.com`. L'installation doit partir d'une surface
                    Shopify — le marchand clique « Installer » sur la fiche App Store,
                    autorise, et revient ici via le callback OAuth (qui crée/rattache
                    son compte). Ne JAMAIS réintroduire de saisie de domaine ici.
                  */}
                  <a
                    href={SHOPIFY_APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
                  >
                    <Store className="h-4 w-4" />
                    Installer Xeyo depuis Shopify
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Shopify vous demandera d’autoriser l’application, puis vous ramènera ici automatiquement.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cette page se met à jour toute seule dès que la boutique est liée. Laissez-la ouverte.
                  </p>

                  {/*
                    ⚠️ LA SORTIE DU CERCLE VICIEUX — ne pas retirer.

                    Le marchand qui arrive ici a TRÈS SOUVENT déjà installé l'app (il
                    vient justement de l'admin Shopify, où on lui a dit de créer un
                    compte). Pour lui, « Installer » ne fait rien : l'app EST installée.
                    Il attendait donc un polling qui ne basculait jamais, enfermé sur
                    cette page à vie — c'était le blocage le plus dur du système.

                    La liaison se fait depuis l'app embedded (bouton « J'ai déjà un
                    compte Xeyo »), qui le renvoie ici avec un jeton signé. On le lui
                    dit explicitement, sinon il ne peut pas le deviner.
                  */}
                  <div className="rounded-lg border bg-muted/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Boutique déjà installée ?</span>{' '}
                      Ouvrez Xeyo depuis votre admin Shopify (Applications → Xeyo) et cliquez sur
                      « J’ai déjà un compte Xeyo » : la boutique sera rattachée à ce compte.
                    </p>
                  </div>
                </div>
              )}

              {/* ── 2. SYNC (attente animée, progression réelle) ── */}
              {step === 'sync' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Nous récupérons tout ce qu’il faut pour personnaliser votre espace.</p>
                  <div className="space-y-2.5 rounded-xl border p-5">
                    {[
                      { label: 'Boutique liée', done: true },
                      { label: `Catalogue produits${state.syncSummary?.products ? `, ${state.syncSummary.products} produits` : ''}`, done: Boolean(state.syncSummary?.products) },
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

              {/* ── 3. WIDGET : activer les extensions dans le thème Shopify ──
                  Sans ces blocs actifs, AUCUN contact n'est collecté (pas de
                  bulle, pas de popup, pas d'opt-in page Merci) → toute la suite
                  de l'app tourne à vide. On guide donc explicitement. */}
              {step === 'widget' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Xeyo est installé sur votre boutique, mais il faut encore <span className="font-medium text-foreground">activer les blocs</span> dans votre thème.
                    Sans ça, <span className="font-medium text-foreground">aucun visiteur ne pourra vous laisser son numéro</span>.
                  </p>

                  {/* Sans numéro WhatsApp connecté, la bulle et la popup NE
                      S'AFFICHENT PAS sur la boutique (le proxy renvoie enabled:false).
                      On le dit clairement, sinon le marchand active les blocs et
                      ne voit rien apparaître — sans comprendre pourquoi. */}
                  {!state.whatsappConnected && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 text-xs leading-relaxed">
                        <p className="font-medium text-amber-200">WhatsApp n’est pas encore connecté</p>
                        <p className="mt-0.5 text-muted-foreground">
                          Vous pouvez activer les blocs maintenant, mais <span className="font-medium text-foreground">ils resteront invisibles sur votre boutique</span> tant qu’aucun numéro WhatsApp n’est connecté (il n’y aurait personne à contacter).
                        </p>
                        <Button variant="outline" size="sm" className="mt-2" disabled={busy}
                          onClick={() => goTo('whatsapp')}>
                          Connecter WhatsApp d’abord
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* LA DÉMO PORTE L'ÉTAPE. On montre le geste au lieu de le décrire :
                      le marchand n'a jamais vu l'éditeur de thème, et l'étape
                      « Remerciements » (un bloc à AJOUTER, sur une AUTRE page — pas un
                      interrupteur) est celle qu'on rate le plus.

                      Les 3 cartes descriptives qui étaient ici ont sauté : elles
                      remplissaient tout le haut de l'écran, repoussaient la démo hors
                      de vue, et redisaient ce que la démo montre. */}
                  <ThemeEditorDemo />

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1"
                      disabled={!state.shopDomain}
                      onClick={() => {
                        if (!state.shopDomain) return
                        // Éditeur de thème, onglet Applications (contexte des blocs d'app).
                        // `activateAppId` PRÉ-ACTIVE le bloc au lieu de simplement
                        // ouvrir l'onglet Applications : sans lui, le marchand
                        // devait trouver « Bulle WhatsApp Xeyo » lui-même dans la
                        // liste. Format attendu : <uid-extension>/<handle-du-bloc>
                        // (uid depuis extensions/xeyo-widget/shopify.extension.toml).
                        window.open(`https://${state.shopDomain}/admin/themes/current/editor?context=apps&activateAppId=e3857e0a-b639-5426-2200-b52aac2028dc82cc2313/whatsapp-bubble`, '_blank', 'noopener')
                      }}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Ouvrir l’éditeur de thème
                    </Button>

                    {/* La POPUP d'opt-in avait été oubliée : seule la bulle avait un
                        lien d'activation. Le marchand devait la trouver seul dans la
                        liste des blocs — exigence 5.1.3 (instructions d'activation
                        des blocs de thème).

                        Même format que la bulle : c'est aussi un app embed
                        (`target: "body"`), donc `activateAppId` suffit. Le bloc
                        `whatsapp-optin`, lui, est un bloc de SECTION : il s'ajoute
                        dans une page précise, ce qu'un deep link ne peut pas faire —
                        c'est la démo au-dessus qui montre le geste. */}
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={!state.shopDomain}
                      onClick={() => {
                        if (!state.shopDomain) return
                        window.open(`https://${state.shopDomain}/admin/themes/current/editor?context=apps&activateAppId=e3857e0a-b639-5426-2200-b52aac2028dc82cc2313/whatsapp-optin-popup`, '_blank', 'noopener')
                      }}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Activer la popup d’opt-in
                    </Button>
                    <Button variant="outline" className="flex-1" disabled={busy}
                      onClick={() => goTo('agent', 'Étape suivante')}>
                      C’est activé, continuer <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Vous pourrez le faire plus tard, mais la collecte de contacts ne démarrera pas avant.
                  </p>
                </div>
              )}

              {/* ── 4. WHATSAPP (recommandé, passable) ── */}
              {step === 'whatsapp' && (
                <div className="space-y-4">
                  {state.whatsappConnected ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                      <Check className="h-4 w-4 text-emerald-500" /> WhatsApp est déjà connecté.
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Connectez votre compte WhatsApp Business via Meta. Sans WhatsApp, vos messages et automatisations seront prêts mais <span className="font-medium text-foreground">rien ne pourra partir</span>.
                      </p>

                      {/* Popup Meta : seul chemin proposé aux marchands. (Les admins
                          ne voient jamais l'onboarding, /api/onboarding/state leur
                          renvoie completed:true, d'où l'absence de saisie manuelle ici.) */}
                      {embeddedSignupAvailable ? (
                        <div className="space-y-2">
                          <WhatsAppEmbeddedSignup
                            className="h-11 w-full"
                            onConnected={async () => { await fetchState(); goTo('widget', 'WhatsApp connecté') }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Vous choisirez votre numéro dans une fenêtre sécurisée Meta (propriétaire de WhatsApp). Aucun identifiant à copier.
                          </p>
                        </div>
                      ) : (
                        // Repli si la config Meta est absente : saisie des 3 identifiants.
                        <div className="space-y-2.5">
                          <input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="Phone Number ID"
                            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                          <input value={waBizId} onChange={(e) => setWaBizId(e.target.value)} placeholder="Business Account ID (WABA)"
                            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                          <input value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder="Access Token (Meta)" type="password"
                            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => goTo('widget')}>
                      Passer pour l’instant
                    </Button>
                    {state.whatsappConnected ? (
                      <Button onClick={() => goTo('widget', 'WhatsApp prêt')}>Continuer <ArrowRight className="ml-1 h-4 w-4" /></Button>
                    ) : !embeddedSignupAvailable ? (
                      // En mode popup Meta, c'est le bouton Facebook qui soumet.
                      <Button disabled={busy} onClick={connectWhatsApp}>
                        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1 h-4 w-4" />}
                        Connecter WhatsApp
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ── 4. AGENT RÉFÉRENT (validation) ── */}
              {/* Intro animée « c'est quoi ce module ? » avant chacune des 3
                  étapes clés, vue une fois. Les générations en arrière-plan
                  continuent pendant ce temps (le temps d'attente est masqué). */}
              {(step === 'agent' || step === 'templates' || step === 'automations') && !seenIntros.has(step) && (
                <ModuleIntro
                  module={step}
                  onStart={() => setSeenIntros((prev) => new Set(prev).add(step as IntroModule))}
                />
              )}

              {step === 'agent' && seenIntros.has('agent') && (
                <div className="space-y-4">
                  {agentLoading || !agentCfg ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                        {agentLoading ? (
                          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /> L’IA prépare votre agent à partir de la boutique…</span>
                        ) : (
                          <>
                            <span>La génération n’a pas abouti.</span>
                            <Button size="sm" variant="outline" onClick={loadAgentCfg}>Réessayer</Button>
                          </>
                        )}
                      </div>
                      <MascotRunner />
                    </div>
                  ) : (
                    /* Mise en scène BD : le panneau devient une BULLE DE
                       DIALOGUE, queue dessinée en bas à droite pointant vers
                       la mascotte (transparente, phone.png) qui « parle ».
                       Étape volontairement minimale : on essaie l'agent
                       (plafonné, coût tokens), le reste se règle plus tard. */
                    <div className="relative space-y-7 py-2 md:pb-4">
                      {/* En-tête : QUI on teste, QUOI faire. Aéré — c'est la première
                          rencontre du marchand avec son agent, elle doit respirer. */}
                      <div className="space-y-2 text-center">
                        <p className="text-xl font-semibold leading-snug text-white sm:text-2xl">
                          Essayez <span className="text-primary">{agentName || agentCfg.name}</span>
                        </p>
                        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                          Il connaît déjà votre boutique. Posez-lui une question comme le ferait un client.
                        </p>
                      </div>

                      <AgentTryChat
                        agentId={agentId}
                        systemPrompt={agentPrompt || agentCfg.system_prompt}
                        suggestions={agentCfg.sample_questions || []}
                        maxQuestions={3}
                      />

                      {/* Pied : la note ne doit pas concurrencer l'action. Séparée par
                          un filet, elle passe au second plan. */}
                      <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                          Nom, ton, instructions et transferts à un humain : modifiables à tout moment depuis <span className="text-foreground/80">Agents IA</span>.
                        </p>
                        <Button size="lg" disabled={busy} onClick={validateAgent} className="shrink-0">
                          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                          Valider mon agent
                        </Button>
                      </div>

                      {/* Bulle de PENSÉE façon BD : petits ronds décroissants qui
                          partent du bord droit de la bulle vers la tête de la
                          mascotte, assise À DROITE du panneau. Cascade spring. */}
                      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
                        {[
                          // Deux ronds seulement, HORS du panneau (le 3e se
                          // superposait au bord), en cascade vers la tête.
                          { size: 24, right: -66, bottom: 62, delay: 0.45 },
                          { size: 12, right: -106, bottom: 30, delay: 0.3 },
                        ].map((c, i) => (
                          <motion.span
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 16, delay: c.delay }}
                            className="absolute rounded-full border border-white/15 bg-[#131b29] shadow-lg"
                            style={{ width: c.size, height: c.size, right: c.right, bottom: c.bottom }}
                          />
                        ))}
                      </div>

                      {/* La mascotte assise À DROITE du panneau (hors bulle),
                          léger flottement continu. */}
                      <motion.img
                        src="/mascots/sitting-phone.png"
                        alt=""
                        aria-hidden
                        initial={{ opacity: 0, y: 26, scale: 0.9 }}
                        animate={{ opacity: 1, y: [0, -6, 0], scale: 1 }}
                        transition={{
                          opacity: { duration: 0.45, delay: 0.2 },
                          scale: { type: 'spring', stiffness: 220, damping: 18, delay: 0.2 },
                          y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
                        }}
                        className="pointer-events-none absolute -bottom-[8.75rem] -right-[13rem] hidden w-36 select-none drop-shadow-2xl lg:block"
                      />
                      {/* Ombre au sol sous ses fesses, qui « respire » en synchro. */}
                      <motion.span
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, scaleX: [1, 0.82, 1] }}
                        transition={{
                          opacity: { duration: 0.45, delay: 0.35 },
                          scaleX: { duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
                        }}
                        className="pointer-events-none absolute -bottom-[9rem] -right-[12.4rem] hidden h-3 w-28 rounded-[100%] bg-black/50 blur-md lg:block"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── 5. MODÈLES (validation) ── */}
              {step === 'templates' && seenIntros.has('templates') && (
                <div className="space-y-4">
                  {packLoading || !pack ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                        {packLoading ? (
                          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Rédaction de vos {15} modèles personnalisés…</span>
                        ) : (
                          <>
                            <span>La génération n’a pas abouti.</span>
                            <Button size="sm" variant="outline" onClick={loadPack}>Réessayer</Button>
                          </>
                        )}
                      </div>
                      <MascotRunner />
                    </div>
                  ) : (
                    <>
                      {/* En-tête MINIMAL : la carte fait sa propre démo de swipe,
                          inutile d'expliquer. Une ligne de contexte + garantie. */}
                      <p className="text-center text-sm text-muted-foreground">
                        Rédigés au ton de <span className="font-medium text-foreground">{state.shopName}</span>
                        <span className="mx-1.5 text-white/25">·</span>
                        🔒 rien n’est créé avant votre validation
                      </p>
                      {!state.whatsappConnected && (
                        <p className="mx-auto w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-center text-xs text-amber-400">
                          📝 Enregistrés en brouillon, à soumettre à Meta une fois WhatsApp connecté
                        </p>
                      )}
                      <TemplateSwiper
                        groups={swipeGroups}
                        selected={selTemplates}
                        editedBodies={editedBodies}
                        onDecide={(trigger, keep) => setSelTemplates((prev) => { const s = new Set(prev); if (keep) s.add(trigger); else s.delete(trigger); return s })}
                        onEditBody={(trigger, body) => setEditedBodies((prev) => ({ ...prev, [trigger]: body }))}
                        onValidate={validateTemplates}
                        busy={busy}
                      />
                    </>
                  )}
                </div>
              )}

              {/* ── 6. AUTOMATISATIONS (validation) ── */}
              {step === 'automations' && seenIntros.has('automations') && (
                <div className="space-y-4">
                  {!pack ? (
                    <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Préparation…
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Vos automatisations, rangées comme dans l’app : le <span className="font-medium text-foreground">Transactionnel</span> (lié aux commandes) et les <span className="font-medium text-foreground">Campagnes marketing</span>. Activez celles qui vous parlent. Elles sont créées <span className="font-medium text-foreground">désactivées</span>, vous les lancerez quand vous serez prêt.
                      </p>
                      {/* Regroupées sous les 2 onglets réels (Transactionnel /
                          Campagnes). Une CARTE par catégorie ; l'interrupteur agit
                          sur toute la famille ; « Personnaliser » ouvre le détail. */}
                      {FAMILIES.map((fam) => {
                        const famCats = fam.cats.filter((cat) => pack.some((i) => (groups[cat] || []).includes(i.trigger)))
                        if (famCats.length === 0) return null
                        return (
                        <div key={fam.key} className="space-y-2">
                          <div className="flex items-center gap-2 pt-1">
                            <span className={cn('h-2 w-2 rounded-full', fam.key === 'marketing' ? 'bg-fuchsia-400' : 'bg-sky-400')} />
                            <h4 className="text-sm font-semibold text-white">{fam.title}</h4>
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{fam.pitch}</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                        {famCats.map((group) => {
                          const triggers = groups[group]
                          const meta = CATEGORY_META[group]
                          const items = pack.filter((i) => triggers.includes(i.trigger))
                          if (items.length === 0) return null
                          const onCount = items.filter((i) => selAutomations.has(i.trigger)).length
                          const allOn = onCount === items.length
                          const isOpen = expanded === group
                          const CatIcon = meta?.icon ?? Workflow
                          return (
                            <motion.div
                              key={group}
                              layout
                              className={cn(
                                'flex flex-col self-start rounded-2xl border transition-colors',
                                onCount > 0 ? 'border-primary/30 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02] opacity-75',
                                isOpen && 'sm:col-span-2',
                              )}
                            >
                              <div className="flex items-start gap-3 p-4">
                                <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', onCount > 0 ? 'bg-primary/15 text-primary' : 'bg-white/5 text-muted-foreground')}>
                                  <CatIcon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-white">{meta?.title ?? group}</p>
                                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/60">{onCount}/{items.length}</span>
                                  </div>
                                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta?.pitch}</p>
                                </div>
                                {/* Interrupteur maître de la famille */}
                                <button
                                  role="switch"
                                  aria-checked={allOn}
                                  aria-label={`Activer ${meta?.title ?? group}`}
                                  onClick={() => setSelAutomations((prev) => {
                                    const s = new Set(prev)
                                    items.forEach((i) => { if (allOn) s.delete(i.trigger); else s.add(i.trigger) })
                                    return s
                                  })}
                                  className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', allOn ? 'bg-primary' : onCount > 0 ? 'bg-primary/40' : 'bg-white/15')}
                                >
                                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', allOn || onCount > 0 ? 'left-[22px]' : 'left-0.5')} />
                                </button>
                              </div>
                              {/* Exemple concret : la promesse en UNE situation. */}
                              {meta?.example && (
                                <p className="mx-4 mb-3 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px] leading-relaxed text-white/60">
                                  {meta.example}
                                </p>
                              )}
                              <button
                                onClick={() => setExpanded(isOpen ? null : group)}
                                className="flex items-center justify-center gap-1 border-t border-white/10 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-white"
                              >
                                Personnaliser <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                              </button>
                              {isOpen && (
                                <div className="space-y-2 border-t border-white/10 p-3">
                                  {items.map((item) => {
                                    const on = selAutomations.has(item.trigger)
                                    return (
                                      <div key={item.trigger} className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors', on ? 'border-primary/30' : 'border-white/10 opacity-60')}>
                                        <input type="checkbox" checked={on} className="h-4 w-4 shrink-0 accent-primary"
                                          onChange={() => setSelAutomations((prev) => { const s = new Set(prev); if (s.has(item.trigger)) s.delete(item.trigger); else s.add(item.trigger); return s })} />
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-[13px] font-medium">{item.automation_name}</p>
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
                              )}
                            </motion.div>
                          )
                        })}
                          </div>
                        </div>
                        )
                      })}
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
                <div className="space-y-6">
                  {/* Cartes « verre » (les 3 plans payants). Toggle mensuel/annuel
                      actif (-20 % sur l'annuel). Abonnement OBLIGATOIRE : plus de
                      plan Gratuit — 7 jours d'essai gratuit sur tout abonnement. */}
                  <PricingGlass
                    title="Choisissez votre formule"
                    description="7 jours d'essai gratuit. Vous pourrez changer de plan ou d'intervalle à tout moment."
                    tiers={PRICING_TIERS}
                    showBillingToggle
                    onSelect={(id, billing) => choosePlan(id, billing)}
                    loadingTierId={planLoading}
                  />

                  {/* ── CODE PROMO ────────────────────────────────────────────
                      Le serveur sait résoudre et appliquer un code depuis
                      toujours, mais l'onboarding ne proposait aucun champ : un
                      code d'acquisition (tarif fondateur, campagne) était donc
                      inutilisable au moment PRÉCIS où il sert le plus — la
                      première souscription. Replié par défaut : un champ visible
                      pousse à chercher un code, et fait hésiter qui n'en a pas. */}
                  <div className="flex flex-col items-center gap-2 text-center">
                    {showPromo ? (
                      <div className="w-full max-w-xs space-y-1.5">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          placeholder="CODE PROMO"
                          autoFocus
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-sm uppercase tracking-widest text-foreground outline-none focus:border-primary"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          La remise s’affichera sur l’écran Shopify avant validation.
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPromo(true)}
                        className="text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                      >
                        J’ai un code promo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
            </AnimatePresence>
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
