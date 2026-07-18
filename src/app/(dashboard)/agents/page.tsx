'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/i18n/context'
import { useSubscription } from '@/hooks/use-subscription'
import { UpgradeBadge } from '@/components/upgrade-badge'
import { cn } from '@/lib/utils'
import type { AIAgent, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Wrench,
  Power,
  PowerOff,
  Copy,
  MoreHorizontal,
  Star,
  StarOff,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { MultiTeamSelect } from '@/components/multi-team-select'
import { AgentTestChat } from '@/components/agent-test-chat'
import { AgentToolsManager } from '@/components/agent-tools-manager'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { getCache, setCache } from '@/hooks/use-cached-fetch'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }
type BookingStats = {
  total_proposals: number
  total_clicks: number
  unique_contacts: number
  conversion_rate: number
}
type AgentWithTeamIds = AIAgent & { team_ids?: string[]; booking_stats?: BookingStats }

// ─── Mascottes & fonds personnalisables ──────────────────────────────────────
const MASCOTS = [
  { key: 'envelope', src: '/mascots/envelope.png' },
  { key: 'phone', src: '/mascots/phone.png' },
  { key: 'selfie', src: '/mascots/selfie.png' },
  // Nouvelles poses de la mascotte Xeyo (fournies par le marchand).
  { key: 'pose-1', src: '/mascots/pose-1.png' },
  { key: 'pose-2', src: '/mascots/pose-2.png' },
  { key: 'pose-5', src: '/mascots/pose-5.png' },
  { key: 'pose-6', src: '/mascots/pose-6.png' },
  { key: 'pose-7', src: '/mascots/pose-7.png' },
  { key: 'pose-8', src: '/mascots/pose-8.png' },
  { key: 'pose-10', src: '/mascots/pose-10.png' },
  { key: 'pose-17', src: '/mascots/pose-17.png' },
  { key: 'pose-19', src: '/mascots/pose-19.png' },
  { key: 'pose-21', src: '/mascots/pose-21.png' },
] as const
const DEFAULT_MASCOT = 'envelope'
const mascotSrc = (key: string | null | undefined) =>
  MASCOTS.find((m) => m.key === key)?.src ?? MASCOTS[0].src

// Les nouvelles poses (pose-*) ont plus de marge transparente autour du
// personnage : à taille égale elles paraissent plus petites que les 3 mascottes
// d'origine (enveloppe/téléphone/selfie), qui remplissent mieux le cadre. On les
// agrandit un peu pour rétablir un rendu homogène dans la carte de l'agent.
const isNewPose = (key: string | null | undefined) => !!key && key.startsWith('pose-')

const MASCOT_BGS: Record<string, string> = {
  green: '#3B82F6',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  coral: '#F0998A',
  amber: '#f59e0b',
  sky: '#0ea5e9',
}
// Couleur de fond effective : choix de l'agent, sinon couleur du type
const mascotBgColor = (key: string | null | undefined, fallback: string) =>
  (key && MASCOT_BGS[key]) || fallback

// Popover de selection mascotte + fond, declenche au clic sur la mascotte
function MascotPicker({ agent, typeColor, onChange, children }: {
  agent: AIAgent
  typeColor: string
  onChange: (patch: { mascot?: string; mascot_bg?: string }) => void
  children: React.ReactNode
}) {
  const currentMascot = agent.mascot ?? DEFAULT_MASCOT
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="center" className="w-72" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Mascotte</p>
        {/* Défilement interne : la liste s'est allongée (nouvelles poses), le
            popover ne doit pas dépasser l'écran. */}
        <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto [scrollbar-width:thin]">
          {MASCOTS.map((m) => (
            <button
              key={m.key}
              onClick={() => onChange({ mascot: m.key })}
              className={cn(
                'flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-muted/40 transition-all hover:border-primary',
                currentMascot === m.key ? 'border-primary ring-2 ring-primary/40' : 'border-border'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.src}
                alt={m.key}
                className={cn(
                  'h-full w-full object-contain',
                  // Nouvelles poses : moins de marge + léger agrandissement pour
                  // qu'elles remplissent la vignette comme les 3 d'origine.
                  isNewPose(m.key) ? 'scale-125 p-0' : 'p-1'
                )}
              />
            </button>
          ))}
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">Fond</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MASCOT_BGS).map(([key, color]) => {
            const active = (agent.mascot_bg ?? '') === key || (!agent.mascot_bg && color === typeColor)
            return (
              <button
                key={key}
                onClick={() => onChange({ mascot_bg: key })}
                title={key}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                  active ? 'border-foreground' : 'border-transparent'
                )}
                style={{ background: color }}
              />
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function AgentsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { subscription } = useSubscription()
  // L'agent IA (création + réponses) est réservé aux plans payants.
  const aiEnabled = subscription?.aiEnabled !== false
  const [agents, setAgents] = useState<AgentWithTeamIds[]>(() => getCache<AgentWithTeamIds[]>('agents') || [])
  const [loading, setLoading] = useState(() => !getCache('agents'))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [agentToDelete, setAgentToDelete] = useState<AgentWithTeamIds | null>(null)
  const [teams, setTeams] = useState<TeamWithRole[]>(() => getCache<TeamWithRole[]>('agents:teams') || [])

  // Test chat state
  const [testChatOpen, setTestChatOpen] = useState(false)
  const [testingAgent, setTestingAgent] = useState<AIAgent | null>(null)

  // Tools state
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsAgent, setToolsAgent] = useState<AgentWithTeamIds | null>(null)

  // Choix du mode de création : automatique (onboarding boutique) ou manuel (fiche vierge)
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false)
  const [creatingManual, setCreatingManual] = useState(false)

  // Carrousel coverflow : index de la carte centrale
  const [centerIndex, setCenterIndex] = useState(0)

  // Largeur/hauteur de viewport pour rendre le carrousel responsive (cartes + translations)
  const [viewportW, setViewportW] = useState(1024)
  const [viewportH, setViewportH] = useState(800)
  useEffect(() => {
    const onResize = () => { setViewportW(window.innerWidth); setViewportH(window.innerHeight) }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data)
        setCache('agents', json.data)
      }
    } catch {
      toast.error(t('agents.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  // Système d'équipes retiré : plus d'appel /api/teams.
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])


  // Chemin de création UNIQUE : onboarding e-commerce pré-rempli depuis
  // l'analyse boutique (plus d'ancien wizard générique secrétaire/RDV).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === 'manual') {
      router.push('/agents/onboard')
    }
  }, [router])

  // Création → écran de choix (automatique / manuel). Édition → fiche détail.
  function openCreateDialog() {
    setCreateChoiceOpen(true)
  }

  // Mode manuel : crée un agent vierge et ouvre sa fiche de configuration complète.
  async function createManualAgent() {
    if (creatingManual) return
    setCreatingManual(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Nouvel agent',
          system_prompt: 'Tu es un assistant e-commerce. Réponds aux clients de la boutique de manière utile et fiable.',
          is_active: false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setCreateChoiceOpen(false)
      router.push(`/agents/${json.data.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreatingManual(false)
    }
  }

  function openEditDialog(agent: AgentWithTeamIds) {
    router.push(`/agents/${agent.id}`)
  }


  function openDeleteDialog(agent: AIAgent) {
    setAgentToDelete(agent)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!agentToDelete) return
    setDeleting(agentToDelete.id)
    try {
      const res = await fetch(`/api/agents/${agentToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id))
        toast.success(t('agents.agent_deleted'))
        setDeleteDialogOpen(false)
        setAgentToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('agents.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleActive(agent: AIAgent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !agent.is_active }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? json.data : a)))
        toast.success(json.data.is_active ? t('agents.agent_enabled') : t('agents.agent_disabled'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  // Définir / retirer l'agent référent (par défaut pour toutes les conversations).
  // Un seul référent par compte : on démarque les autres localement.
  async function handleToggleDefault(agent: AIAgent) {
    const next = !agent.is_default
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Un agent référent doit être actif pour répondre → on l'active aussi.
        body: JSON.stringify(next ? { is_default: true, is_active: true } : { is_default: false }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) =>
          a.id === agent.id ? json.data : (next ? { ...a, is_default: false } : a)
        ))
        toast.success(next ? 'Agent référent défini' : 'Agent référent retiré')
      } else {
        toast.error(json.error || t('common.network_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  // Mise a jour de la mascotte / fond (optimiste)
  async function handleUpdateMascot(agent: AIAgent, patch: { mascot?: string; mascot_bg?: string }) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, ...patch } : a)))
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleDuplicate(agent: AIAgent) {
    try {
      setSaving(true)
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${agent.name} (copie)`,
          description: agent.description,
          system_prompt: agent.system_prompt,
          objective: agent.objective,
          model: agent.model,
          temperature: agent.temperature,
          response_delay_min: agent.response_delay_min,
          response_delay_max: agent.response_delay_max,
          max_messages_per_conversation: agent.max_messages_per_conversation,
          inactivity_timeout_minutes: agent.inactivity_timeout_minutes,
          escalation_enabled: agent.escalation_enabled,
          escalation_mode: (agent as any).escalation_mode || 'keywords',
          escalation_keywords: agent.escalation_keywords,
          escalation_message: agent.escalation_message,
          booking_url: agent.booking_url,
          agent_type: agent.agent_type,
          stop_condition: agent.stop_condition,
          team_ids: (agent as AIAgent & { team_ids?: string[] }).team_ids || (agent.team_id ? [agent.team_id] : []),
          is_active: false,
          schedule_enabled: agent.schedule_enabled,
          schedule_timezone: agent.schedule_timezone,
          schedule_start_time: agent.schedule_start_time,
          schedule_end_time: agent.schedule_end_time,
          schedule_days: agent.schedule_days,
          auto_detect_language: agent.auto_detect_language,
          // L'agent dupliqué hérite des documents de l'original (seuls les
          // liens sont recopiés : aucun fichier n'est ré-uploadé).
          copy_knowledge_from: agent.id,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => [json.data, ...prev])
        toast.success(t('agents.duplicated'))
      } else {
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <BlobLoaderScreen />
  }

  return (
    <div className="relative flex min-h-full flex-col overflow-x-hidden overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-6">
      {/* Fond d'ambiance : glow coloré + grille animée (toujours visible).
          IMPORTANT : z-0 (PAS -z-10), sinon la grille passe derrière le fond
          opaque (bg-background) du conteneur parent du layout et devient invisible.
          Les contenus ci-dessous sont en relative z-10 pour passer au-dessus. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, #8b5cf6 45%, transparent 70%)' }} />
        {/* Grille bleue qui dérive lentement (visible en clair comme en sombre) */}
        <div className="absolute inset-0 animated-grid-bg opacity-60" />
      </div>

      <div className="relative z-10 mb-2">
        <div data-tour="agents-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('agents.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('agents.description')}
          </p>
        </div>
      </div>

      {/* Zone : carrousel centré, bouton Nouvel agent juste en dessous.
          `py-2` (et non py-6) : la zone est déjà en flex-1 + justify-center,
          un padding généreux ne faisait qu'éloigner titre / cartes / bouton. */}
      <div className={cn('relative z-10 flex flex-1 flex-col py-2', agents.length === 0 ? 'items-center justify-center px-6' : 'items-center justify-start lg:justify-center')}>
      {/* Carrés lumineux animés en arrière-fond (onboarding), la grille de fond
          est désormais affichée en permanence au niveau de la page. */}
      {agents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <span className="animated-grid-square" style={{ left: '18%', top: '28%', width: 28, height: 28, animationDelay: '0s' }} />
          <span className="animated-grid-square" style={{ left: '78%', top: '22%', width: 20, height: 20, animationDelay: '1.2s' }} />
          <span className="animated-grid-square" style={{ left: '24%', top: '72%', width: 24, height: 24, animationDelay: '2.4s' }} />
          <span className="animated-grid-square" style={{ left: '72%', top: '68%', width: 34, height: 34, animationDelay: '0.6s' }} />
          <span className="animated-grid-square" style={{ left: '50%', top: '12%', width: 18, height: 18, animationDelay: '3s' }} />
          <span className="animated-grid-square" style={{ left: '40%', top: '82%', width: 22, height: 22, animationDelay: '1.8s' }} />
        </div>
      )}
      {agents.length === 0 ? (
        // Onboarding intégré, centré et animé (au-dessus de la grille)
        <div className="relative z-10 w-full max-w-lg">
          {/* Halo animé en fond */}
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl agent-onboarding-glow" />

          <div className="flex flex-col items-center text-center">
            {/* La mascotte assise au téléphone (détourée), halo qui pulse dessous. */}
            <div className="relative mb-5 flex h-32 w-32 items-center justify-center">
              <span className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 blur-xl agent-onboarding-pulse" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascots/sitting-phone.png" alt="" className="relative h-32 w-auto select-none drop-shadow-2xl" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Créons ton premier agent IA</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Un agent intelligent qui répond automatiquement à vos clients, 24/7.
            </p>
          </div>

          <div className="mt-7 space-y-3">
            {!aiEnabled && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600">
                L’agent IA est réservé aux plans payants. <UpgradeBadge label="Voir les formules" />
              </div>
            )}
            <button
              onClick={aiEnabled ? openCreateDialog : undefined}
              disabled={!aiEnabled}
              className={cn(
                'group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition-all',
                aiEnabled
                  ? 'border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 hover:border-primary hover:shadow-md hover:shadow-primary/10'
                  : 'cursor-not-allowed border-border bg-muted/30 opacity-60'
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm transition-transform group-hover:scale-105">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Configurer mon agent</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Auto</span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">On l&apos;a pré-configuré à partir de ta boutique : tu vérifies et tu actives.</div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      ) : (
        (() => {
          // L'agent référent (is_default) passe en tête — remplace l'épinglage.
          const sorted = [...agents].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
          const n = sorted.length
          const center = ((centerIndex % n) + n) % n
          const go = (dir: number) => setCenterIndex(c => (((c + dir) % n) + n) % n)

          // Dimensions responsive : la carte ne doit jamais deborder du viewport.
          // Carte responsive : grandit avec l'écran (plafond plus haut sur desktop
          // large) pour ne plus laisser un grand vide autour.
          const isMobile = viewportW < 640
          const cardCap = viewportW >= 1280 ? 480 : viewportW >= 1024 ? 440 : 400
          const cardW = Math.min(cardCap, Math.max(240, viewportW - 96))
          const sceneW = Math.min(cardCap + 80, viewportW - 32)
          // Hauteur de scène : idéale selon la carte, MAIS plafonnée par la hauteur
          // dispo (topbar + titre au-dessus, flèches/points + bouton "Nouvel agent"
          // en dessous ≈ 320px réservés) pour que le bouton reste visible sans scroll.
          const idealSceneH = cardW >= 440 ? 500 : cardW >= 360 ? 440 : cardW >= 300 ? 400 : 360
          // Espace réellement occupé SOUS/AU-DESSUS de la scène : topbar (~64) +
          // titre (~74) + paddings (~16) + points (~14) + bouton « Nouvel agent »
          // (~72). On le réserve pour que le bouton reste visible sans scroll.
          const RESERVED = 240
          // Plancher à 360 : en dessous la carte (image + nom + boutons) ne tient
          // plus. Si le viewport est encore plus court, la page défile — c'est
          // préférable à un bouton « Nouvel agent » coupé hors de l'écran.
          const sceneH = Math.max(360, Math.min(idealSceneH, viewportH - RESERVED))
          // Translation laterale des cartes voisines, proportionnelle a la largeur de carte
          const stepFront = cardW * 0.9
          const stepBack = cardW * 0.8

          // `pt` réduit : la mascotte déborde déjà au-dessus de sa zone, un grand
          // padding créait un vide inutile entre le titre et les cartes.
          const imgH = sceneH >= 440 ? 256 : sceneH >= 400 ? 224 : sceneH >= 370 ? 196 : 168
          // Les flèches se calaient sur `top-1/2` du CONTENEUR, donc trop bas : les
          // cartes sont ancrées en `top-0`, et une carte latérale est plus courte
          // que la centrale (pas de bouton « Configurer »). On vise son milieu :
          // image + nom + statut ≈ imgH + 90, le tout à l'échelle 0.92.
          const sideCardH = (imgH + 90) * 0.92
          const arrowTop = 8 + sideCardH / 2
          return (
            <div className="relative flex w-full shrink-0 items-center justify-center pb-4 pt-2" style={{ perspective: '2000px' }}>
              {/* Flèche gauche */}
              {n > 1 && (
                <button onClick={() => go(-1)} aria-label="Précédent"
                  style={{ top: arrowTop }}
                  className="absolute left-0 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground backdrop-blur transition-all hover:scale-110 hover:bg-muted hover:text-foreground sm:h-12 sm:w-12">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* Scène coverflow */}
              <div className="relative mx-auto w-full" style={{ height: sceneH, maxWidth: sceneW, transformStyle: 'preserve-3d' }}>
                {sorted.map((agent, idx) => {
                  // offset relatif au centre, normalisé sur [-n/2, n/2]
                  let offset = idx - center
                  if (offset > n / 2) offset -= n
                  if (offset < -n / 2) offset += n
                  const abs = Math.abs(offset)
                  // Desktop : centre + 2 de chaque cote. Mobile : centre + 1 seulement
                  // (les cartes lointaines formaient des "bulles" empilees au bord).
                  if (abs > (isMobile ? 1 : 2)) return null

                  const isCenter = offset === 0
                  const isFront = abs <= 1 // les 3 cards "plein face" (centre + 2 voisines)
                  const isDeleting = deleting === agent.id
                  // Couleur de halo/fond : choix de l'agent sinon couleur par défaut
                  const typeColor = mascotBgColor(agent.mascot_bg, '#8b5cf6')
                  const typeLabel = 'Conversation'

                  // Les voisines immédiates (±1) restent quasi de face ; au-delà, fort retrait.
                  const tx = offset * (isFront ? stepFront : stepBack)
                  const tz = isFront ? -abs * 100 : -240 - (abs - 1) * 180
                  const rot = isFront ? offset * -6 : offset * -38
                  const scale = isCenter ? 1 : isFront ? 0.92 : 0.8
                  const opacity = abs === 0 ? 1 : abs === 1 ? 0.9 : abs === 2 ? 0.35 : 0.18

                  return (
                    <div
                      key={agent.id}
                      onClick={() => { if (!isCenter) setCenterIndex(idx) }}
                      className={cn('absolute left-1/2 top-0 transition-all duration-500 ease-out', !isCenter && 'cursor-pointer')}
                      style={{
                        width: cardW,
                        transform: `translateX(-50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${rot}deg) scale(${scale})`,
                        opacity,
                        zIndex: 20 - abs,
                        filter: isCenter ? 'none' : `brightness(${isFront ? 0.82 : 0.6})`,
                        pointerEvents: abs > 2 ? 'none' : 'auto',
                      }}
                    >
                      {/* Carte */}
                      <div
                        className={cn(
                          'group/card relative flex flex-col rounded-[34px] border border-border bg-card pb-6 transition-shadow duration-300',
                          isCenter ? 'shadow-2xl ring-1' : 'shadow-md',
                          !agent.is_active && 'opacity-70'
                        )}
                        style={isCenter ? { '--tw-ring-color': `${typeColor}40` } as React.CSSProperties : {}}
                      >
                        {/* Zone visuelle (mascotte), overflow visible pour laisser
                            le bras + enveloppe deborder a gauche de la carte */}
                        <div
                          className="relative flex items-end justify-center rounded-t-[34px] m-2 mb-0"
                          style={{ height: sceneH >= 440 ? 256 : sceneH >= 400 ? 224 : sceneH >= 370 ? 196 : 168, background: `radial-gradient(130% 110% at 50% 22%, ${typeColor}30 0%, ${typeColor}0c 48%, transparent 78%)` }}
                        >
                          {/* halo derriere la mascotte */}
                          <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl" style={{ background: typeColor }} />
                          {/* Mascotte (buste) : ancree en bas, le bras + enveloppe deborde a gauche.
                              Sur la carte centrale, clic = popover de selection mascotte + fond. */}
                          {isCenter ? (
                            <MascotPicker agent={agent} typeColor="#8b5cf6" onChange={(patch) => handleUpdateMascot(agent, patch)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={mascotSrc(agent.mascot)}
                                alt={agent.name}
                                title={t('common.edit')}
                                /* max-h-[128%] : la mascotte déborde volontairement un peu au-dessus
                                   de sa zone (c'est le parti pris visuel), mais la hauteur doit
                                   rester BORNÉE, sans plafond, `w-[112%] object-contain` la faisait
                                   grandir sans limite et recouvrir le titre de la page.
                                   Les nouvelles poses sont agrandies (cf. isNewPose). */
                                className={cn(
                                  'absolute -left-5 bottom-0 z-10 max-w-none cursor-pointer object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-out hover:-translate-y-1.5 hover:scale-[1.02]',
                                  isNewPose(agent.mascot) ? 'max-h-[150%] w-[132%]' : 'max-h-[128%] w-[112%]'
                                )}
                              />
                            </MascotPicker>
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={mascotSrc(agent.mascot)}
                              alt={agent.name}
                              className={cn(
                                'pointer-events-none absolute -left-5 bottom-0 max-w-none object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]',
                                isNewPose(agent.mascot) ? 'max-h-[150%] w-[132%]' : 'max-h-[128%] w-[112%]'
                              )}
                            />
                          )}
                          {/* Badge type (pill, en haut a gauche) */}
                          <span
                            className="absolute left-4 top-4 z-10 rounded-full px-3 py-1 text-[11px] font-semibold"
                            style={{ background: `${typeColor}1f`, color: typeColor }}
                          >
                            {typeLabel}
                          </span>
                        </div>

                        {/* Pilule flottante verte (épingler + activer), carte centrale */}
                        {isCenter && (
                          <div
                            className="absolute right-0 top-6 z-10 flex translate-x-1/4 flex-col items-center gap-0.5 rounded-full py-1 shadow-lg sm:top-7 sm:translate-x-1/3 sm:py-1.5"
                            style={{ background: '#3b82f6' }}
                          >
                            {/* Étoile = agent RÉFÉRENT (is_default). L'épinglage
                                (is_pinned), purement cosmétique, faisait doublon. */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleDefault(agent) }}
                              title={agent.is_default ? 'Retirer comme référent' : 'Définir comme référent'}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition-all hover:scale-110 hover:text-white sm:h-9 sm:w-9"
                            >
                              <Star className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', agent.is_default && 'fill-current')} />
                            </button>
                            <span className="h-px w-3 bg-white/25 sm:w-4" />
                            <button
                              data-tour="agent-activate"
                              onClick={(e) => { e.stopPropagation(); handleToggleActive(agent) }}
                              title={agent.is_active ? 'Désactiver' : 'Activer'}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-white/90 transition-all hover:scale-110 hover:text-white sm:h-9 sm:w-9"
                            >
                              {agent.is_active ? <Power className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <PowerOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                            </button>
                          </div>
                        )}

                        {/* Infos, minimal : nom + statut */}
                        <div className="px-6 pt-5 text-center">
                          <h3 className="truncate text-[19px] font-bold tracking-tight text-foreground">{agent.name}</h3>
                          {agent.is_default && (
                            <>
                              <span
                                className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600"
                                title="L'agent référent est celui qui répond à TOUTES les conversations WhatsApp de la boutique."
                              >
                                <Star className="h-3 w-3 fill-current" /> Agent référent
                              </span>
                              {/* La promesse en clair : c'est LUI qui parle à tout le monde. */}
                              <p className="mt-0.5 text-[11px] text-muted-foreground">Répond à tous vos clients</p>
                            </>
                          )}
                          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
                            <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                            {agent.is_active ? t('common.active') : t('common.inactive')}
                          </div>
                        </div>

                        {/* Actions, bouton plein large + menu, seulement sur la carte centrale */}
                        {isCenter && (
                          <div className="mt-5 flex items-center gap-2 px-5 sm:gap-2.5 sm:px-6">
                            <Link href={`/agents/${agent.id}`} className="flex-1" onClick={(e) => e.stopPropagation()}>
                              <button className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground shadow-[0_10px_24px_-8px] shadow-primary/40 transition-all hover:brightness-105 active:scale-[0.98] sm:h-12 sm:text-[14px]">
                                Configurer
                              </button>
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); setTestingAgent(agent); setTestChatOpen(true) }}
                              title={t('common.test')}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:h-12 sm:w-12"
                            >
                              <MessageSquare className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                            </button>
                            <button
                              data-tour="agent-tools-btn"
                              onClick={(e) => { e.stopPropagation(); setToolsAgent(agent); setToolsOpen(true) }}
                              title={t('tools.title')}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:h-12 sm:w-12"
                            >
                              <Wrench className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button onClick={(e) => e.stopPropagation()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:h-12 sm:w-12">
                                  <MoreHorizontal className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => handleToggleDefault(agent)}>
                                  {agent.is_default ? <StarOff className="mr-2 h-3.5 w-3.5" /> : <Star className="mr-2 h-3.5 w-3.5" />}
                                  {agent.is_default ? 'Retirer comme référent' : 'Définir comme référent'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleActive(agent)}>
                                  {agent.is_active ? <PowerOff className="mr-2 h-3.5 w-3.5" /> : <Power className="mr-2 h-3.5 w-3.5" />}
                                  {agent.is_active ? 'Désactiver' : 'Activer'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(agent)}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  {t('common.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(agent)} disabled={saving}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  {t('common.duplicate')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(agent)}
                                  disabled={isDeleting}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {isDeleting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                                  {t('common.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Flèche droite */}
              {n > 1 && (
                <button onClick={() => go(1)} aria-label="Suivant"
                  style={{ top: arrowTop }}
                  className="absolute right-0 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground backdrop-blur transition-all hover:scale-110 hover:bg-muted hover:text-foreground sm:h-12 sm:w-12">
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}

            </div>
          )
        })()
      )}

      {/* Indicateurs (points), HORS de la scène 3D : en `absolute bottom-0`
          dedans, ils passaient sous la carte centrale (qui déborde en 3D) et
          se retrouvaient tracés par-dessus le bouton « Configurer ». */}
      {agents.length > 1 && (
        // `flex-wrap` + `shrink-0` : sans eux, le flex étirait les points en gros
        // cercles dès que la largeur manquait (11 agents sur un écran mobile).
        <div className="mt-1 flex shrink-0 flex-wrap justify-center gap-1.5 px-4">
          {agents.map((_, i) => {
            const active = ((centerIndex % agents.length) + agents.length) % agents.length === i
            return (
              <button key={i} onClick={() => setCenterIndex(i)} aria-label={`Agent ${i + 1}`}
                className={cn('h-1.5 shrink-0 rounded-full transition-all',
                  active ? 'w-5 bg-foreground/70' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50')} />
            )
          })}
        </div>
      )}

      {/* Bouton "Nouvel agent", juste sous les cartes et les points */}
      <div className="mt-3 flex shrink-0 flex-col items-center gap-2">
        <button
          data-tour="new-agent-btn"
          onClick={aiEnabled ? openCreateDialog : undefined}
          disabled={!aiEnabled}
          className={cn(
            'group flex items-center gap-2.5 rounded-3xl px-6 py-3.5 text-sm font-semibold ring-1 transition-all',
            aiEnabled
              ? 'bg-primary text-primary-foreground shadow-[0_12px_30px_-8px] shadow-primary/40 ring-white/10 hover:scale-[1.03] hover:shadow-primary/50'
              : 'cursor-not-allowed bg-muted text-muted-foreground ring-border'
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-white/20">
            <Plus className="h-4 w-4" />
          </span>
          {t('agents.new_agent')}
        </button>
        {!aiEnabled && <UpgradeBadge label="Agent IA, plan payant" />}
      </div>
      </div>


      {/* Choix du mode de création : automatique (boutique) ou manuel (fiche vierge) */}
      <Dialog open={createChoiceOpen} onOpenChange={(o) => { if (!creatingManual) setCreateChoiceOpen(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer un agent IA</DialogTitle>
            <DialogDescription>Comment veux-tu le configurer ?</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <button
              onClick={() => { setCreateChoiceOpen(false); router.push('/agents/onboard') }}
              disabled={creatingManual}
              className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-5 text-left transition-all hover:border-primary hover:shadow-md hover:shadow-primary/10 disabled:opacity-60"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm transition-transform group-hover:scale-105">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Automatique</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Recommandé</span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">Pré-configuré à partir de ta boutique (SAV, suivi commande, conseil). Tu vérifies et tu actives.</div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={createManualAgent}
              disabled={creatingManual}
              className="group flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all hover:border-foreground/20 hover:bg-muted/40 disabled:opacity-60"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform group-hover:scale-105">
                {creatingManual ? <Loader2 className="h-6 w-6 animate-spin" /> : <Wrench className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Manuel</div>
                <div className="mt-0.5 text-sm text-muted-foreground">Crée un agent vierge et configure tout toi-même dans sa fiche.</div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setAgentToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('agents.delete_title')}
        description={t('agents.delete_desc', { name: agentToDelete?.name || '' })}
        loading={deleting === agentToDelete?.id}
      />

      {/* Agent Test Chat */}
      {testingAgent && (
        <AgentTestChat
          open={testChatOpen}
          onOpenChange={(open) => {
            setTestChatOpen(open)
            if (!open) setTestingAgent(null)
          }}
          agentId={testingAgent.id}
          agentName={testingAgent.name}
        />
      )}

      {/* Agent Tools Dialog */}
      <Dialog open={toolsOpen} onOpenChange={(open) => {
        setToolsOpen(open)
        if (!open) setToolsAgent(null)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              {t('tools.title')}, {toolsAgent?.name}
            </DialogTitle>
            <DialogDescription>{t('tools.dialog_desc')}</DialogDescription>
          </DialogHeader>
          {toolsAgent && (
            <AgentToolsManager agentId={toolsAgent.id} agentName={toolsAgent.name} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

