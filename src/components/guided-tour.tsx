'use client'

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

// Types
interface TourStep {
  id: string
  page: string
  target: string // CSS selector
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  action?: 'click' | 'hover' | 'none'
  requiredPlan?: 'pro' | 'scale' // step masquÃ© si le plan ne l'autorise pas
}

interface TourContextType {
  isActive: boolean
  currentStep: number
  steps: TourStep[]
  startTour: () => void
  endTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
}

// Tour steps configuration - title/description hold i18n keys.
//
// Parcours complet, page par page, comme demandé. Chaque `target` vise une ancre
// `data-tour` posée sur la page. Si une ancre manque (page vide, écran étroit),
// l'étape s'affiche quand même, centrée (cf. TourOverlay). L'ordre suit le trajet
// naturel : dashboard → conversations → agents → automatisations → campagnes →
// transactionnel → stats.
const ALL_TOUR_STEPS: TourStep[] = [
  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  {
    id: 'dashboard-welcome',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'tour.welcome_title',
    description: 'tour.welcome_desc',
    position: 'bottom',
  },
  {
    id: 'dashboard-whatsapp',
    page: '/dashboard',
    target: '[data-tour="whatsapp-connect"]',
    title: 'tour.dash_whatsapp_title',
    description: 'tour.dash_whatsapp_desc',
    position: 'bottom',
  },
  {
    id: 'dashboard-shopify',
    page: '/dashboard',
    target: '[data-tour="shopify-connect"]',
    title: 'tour.dash_shopify_title',
    description: 'tour.dash_shopify_desc',
    position: 'bottom',
  },
  // ── CONVERSATIONS ──────────────────────────────────────────────────────────
  {
    id: 'conversations-page',
    page: '/conversations',
    target: '[data-tour="conversations-header"]',
    title: 'tour.conversations_title',
    description: 'tour.conversations_desc',
    position: 'bottom',
  },
  {
    id: 'conversations-list',
    page: '/conversations',
    target: '[data-tour="conversation-list"]',
    title: 'tour.conv_list_title',
    description: 'tour.conv_list_desc',
    position: 'right',
  },
  {
    id: 'conversations-tags',
    page: '/conversations',
    target: '[data-tour="conversations-filters"]',
    title: 'tour.conv_tags_title',
    description: 'tour.conv_tags_desc',
    position: 'bottom',
  },
  {
    id: 'conversations-summary',
    page: '/conversations',
    target: '[data-tour="conversation-summary"]',
    title: 'tour.conv_summary_title',
    description: 'tour.conv_summary_desc',
    position: 'left',
  },
  {
    id: 'conversations-orders',
    page: '/conversations',
    target: '[data-tour="conversation-orders"]',
    title: 'tour.conv_orders_title',
    description: 'tour.conv_orders_desc',
    position: 'left',
  },
  {
    id: 'conversations-ai-toggle',
    page: '/conversations',
    target: '[data-tour="conversation-ai-toggle"]',
    title: 'tour.conv_ai_title',
    description: 'tour.conv_ai_desc',
    position: 'left',
  },
  // ── AGENTS IA ──────────────────────────────────────────────────────────────
  {
    id: 'agents-page',
    page: '/agents',
    target: '[data-tour="agents-header"]',
    title: 'tour.agents_title',
    description: 'tour.agents_desc',
    position: 'bottom',
  },
  {
    id: 'agents-new',
    page: '/agents',
    target: '[data-tour="new-agent-btn"]',
    title: 'tour.create_agent_title',
    description: 'tour.create_agent_desc',
    position: 'top',
  },
  {
    id: 'agents-customize',
    page: '/agents',
    target: '[data-tour="agents-header"]',
    title: 'tour.agent_customize_title',
    description: 'tour.agent_customize_desc',
    position: 'bottom',
  },
  // ── AUTOMATISATIONS ────────────────────────────────────────────────────────
  {
    id: 'automations-page',
    page: '/automations',
    target: '[data-tour="automations-header"]',
    title: 'tour.automations_title',
    description: 'tour.automations_desc',
    position: 'bottom',
  },
  {
    id: 'automations-transactional',
    page: '/automations',
    target: '[data-tour="automations-header"]',
    title: 'tour.transactional_title',
    description: 'tour.transactional_desc',
    position: 'bottom',
  },
  {
    id: 'automations-new',
    page: '/automations',
    target: '[data-tour="automation-new-btn"]',
    title: 'tour.automation_new_title',
    description: 'tour.automation_new_desc',
    position: 'left',
  },
  // ── CAMPAGNES : PLUS D'ÉTAPE DÉDIÉE ────────────────────────────────────────
  //
  // Les campagnes ont été fusionnées dans /automations?tab=marketing — la page
  // /campaigns n'est plus une destination. Ces deux étapes y envoyaient encore
  // le marchand (le guide fait `router.push(step.page)`), et leurs ancres
  // `campaigns-header` / `new-campaign-btn` n'existent pas sur /automations :
  // le guide serait resté bloqué à chercher un élément absent.
  //
  // ⚠️ Ne PAS les pointer vers '/automations?tab=marketing' : le guide compare
  // `pathname !== step.page`, et `pathname` vaut '/automations' sans les
  // paramètres — la navigation boucherait à l'infini.
  //
  // Le marketing reste couvert : l'étape `automations-transactional` explique
  // déjà « Transactionnel vs Campagnes », et `automations-new` montre le bouton
  // de création, commun aux deux onglets.
  // ── STATS ──────────────────────────────────────────────────────────────────
  {
    id: 'stats-page',
    page: '/stats',
    target: '[data-tour="stats-header"]',
    title: 'tour.stats_title',
    description: 'tour.stats_desc',
    position: 'bottom',
  },
  // ── FIN ────────────────────────────────────────────────────────────────────
  {
    id: 'tour-end',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'tour.ready_title',
    description: 'tour.ready_desc',
    position: 'bottom',
  },
]

// Context
const TourContext = createContext<TourContextType | null>(null)

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within TourProvider')
  }
  return context
}

function filterStepsByPlan(plan: string): TourStep[] {
  return ALL_TOUR_STEPS.filter(step => {
    if (!step.requiredPlan) return true
    if (step.requiredPlan === 'pro') return plan === 'pro' || plan === 'scale'
    if (step.requiredPlan === 'scale') return plan === 'scale'
    return true
  })
}

// Provider
export function TourProvider({ children, plan = 'scale' }: { children: React.ReactNode; plan?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isNavigating, setIsNavigating] = useState(false)

  const TOUR_STEPS = filterStepsByPlan(plan)
  const step = TOUR_STEPS[currentStep]

  // Navigate to step's page if needed
  useEffect(() => {
    if (isActive && step && pathname !== step.page && !isNavigating) {
      setIsNavigating(true)
      router.push(step.page)
    }
  }, [isActive, step, pathname, router, isNavigating])

  // Reset navigating state when we reach the correct page
  useEffect(() => {
    if (isActive && step && pathname === step.page) {
      setIsNavigating(false)
    }
  }, [isActive, step, pathname])

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
    if (TOUR_STEPS[0]?.page !== pathname) {
      router.push(TOUR_STEPS[0]?.page ?? '/dashboard')
    }
  }, [pathname, router, TOUR_STEPS])

  const endTour = useCallback(() => {
    setIsActive(false)
    setCurrentStep(0)
    localStorage.setItem('autyvia_tour_completed', 'true')
  }, [])

  // ⚠️ DÉMARRAGE AUTOMATIQUE À LA 1re CONNEXION.
  //
  // Si le tour n'a jamais été terminé/fermé (pas de flag localStorage), on le
  // lance une fois, depuis le dashboard. Un petit délai laisse la page se monter
  // (sinon la 1re cible n'est pas encore là). Marqué « vu » AVANT de lancer : même
  // si l'utilisateur recharge en plein tour, il ne redémarre pas en boucle.
  // ⚠️ L'effet DOIT suivre `pathname` (il avait `[]`).
  //
  // Le provider vit dans le layout : il se monte AVANT que la route soit
  // /dashboard (l'arrivée depuis l'onboarding passe par une redirection). Avec
  // `[]`, l'effet ne tournait qu'une fois, voyait un chemin différent, sortait —
  // et ne se relançait jamais. Résultat : un marchand qui vient de s'inscrire
  // n'avait PAS le guide. On écoute donc les changements de route, et le flag
  // localStorage (+ la ref) garantit qu'on ne lance qu'une seule fois.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (autoStartedRef.current) return
    if (localStorage.getItem('autyvia_tour_completed')) return
    if (pathname !== '/dashboard') return // on n'auto-lance que depuis l'accueil
    autoStartedRef.current = true
    localStorage.setItem('autyvia_tour_completed', 'true')
    const timer = setTimeout(() => startTour(), 1200)
    return () => clearTimeout(timer)
    // startTour est stable ; on ne veut lancer qu'une fois (garde par ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      endTour()
    }
  }, [currentStep, endTour, TOUR_STEPS.length])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < TOUR_STEPS.length) {
      setCurrentStep(index)
    }
  }, [TOUR_STEPS.length])

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      steps: TOUR_STEPS,
      startTour,
      endTour,
      nextStep,
      prevStep,
      goToStep,
    }}>
      {children}
      {isActive && !isNavigating && <TourOverlay />}
    </TourContext.Provider>
  )
}

/**
 * Bouton « Guide » de la topbar : relance le tour à tout moment.
 * Doit être rendu À L'INTÉRIEUR du TourProvider (c'est le cas dans le layout).
 */
export function TourGuideButton({ className }: { className?: string }) {
  const { startTour } = useTour()
  const { t } = useTranslation()
  return (
    <button
      onClick={startTour}
      aria-label={t('tour.interactive_guide')}
      title={t('tour.interactive_guide')}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className
      )}
    >
      <Sparkles className="h-[18px] w-[18px]" />
      <span className="hidden sm:inline">{t('tour.interactive_guide')}</span>
    </button>
  )
}

// Overlay component that highlights elements
function TourOverlay() {
  const { currentStep, steps, nextStep, prevStep, endTour } = useTour()
  const { t } = useTranslation()
  const tenant = useTenant()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  // ⚠️ CIBLE INTROUVABLE → ON EXPLIQUE QUAND MÊME (tour jamais bloqué).
  //
  // Une étape peut viser un élément absent : page vide (aucune conversation, aucun
  // agent…), ou ancre non montée. Avant, l'overlay restait sur un « Chargement… »
  // infini et le tour était coincé. Désormais, passé les tentatives, on affiche la
  // bulle CENTRÉE sans spotlight : l'utilisateur lit l'explication de la zone et
  // continue. C'est le comportement demandé (« pointer la zone même vide »).
  const [targetMissing, setTargetMissing] = useState(false)

  // Find and track target element
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 20 // ~2 s puis on bascule en mode « centré »
    let retryTimer: NodeJS.Timeout | null = null
    setTargetMissing(false)
    // ⚠️ On EFFACE la position de l'étape PRÉCÉDENTE dès le changement d'étape.
    //
    // Sans ça, la bulle restait affichée à l'ancienne position (ancien rect) puis
    // « sautait » vers la nouvelle quand la cible était trouvée — l'effet de
    // placement lent constaté. En repartant de null, on montre brièvement l'état
    // de chargement, puis la bulle apparaît DIRECTEMENT au bon endroit.
    setTargetRect(null)
    let scrolled = false

    const updatePosition = (target: Element) => {
      // Amener la cible dans le viewport la 1re fois (si elle est hors-écran, le
      // rect serait hors-cadre et la bulle mal placée).
      if (!scrolled) {
        scrolled = true
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
      }
      const rect = target.getBoundingClientRect()
      setTargetRect(rect)

      // Calculate tooltip position
      const padding = 16
      const tooltipWidth = 360
      const tooltipHeight = 200 // approximate

      let top = 0
      let left = 0

      switch (step.position || 'bottom') {
        case 'top':
          top = rect.top - tooltipHeight - padding
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case 'bottom':
          top = rect.bottom + padding
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case 'left':
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.left - tooltipWidth - padding
          break
        case 'right':
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.right + padding
          break
      }

      // Keep tooltip in viewport
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding))
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding))

      setTooltipStyle({ top, left, width: tooltipWidth })
    }

    const findTarget = () => {
      const target = document.querySelector(step.target)
      if (target) {
        updatePosition(target)
        retryCount = 0 // Reset retry count when found
      } else if (retryCount < maxRetries) {
        // Element not found, retry after a short delay
        retryCount++
        retryTimer = setTimeout(findTarget, 100)
      } else {
        // Cible définitivement absente → bulle centrée, sans spotlight.
        setTargetRect(null)
        setTargetMissing(true)
        setTooltipStyle({
          top: window.innerHeight / 2 - 120,
          left: window.innerWidth / 2 - 180,
          width: 360,
        })
      }
    }

    // Initial find with small delay to let page render
    retryTimer = setTimeout(findTarget, 50)

    // Listen for resize/scroll to update position
    const handleUpdate = () => {
      const target = document.querySelector(step.target)
      if (target) {
        updatePosition(target)
      }
    }

    window.addEventListener('resize', handleUpdate)
    window.addEventListener('scroll', handleUpdate, true)

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('resize', handleUpdate)
      window.removeEventListener('scroll', handleUpdate, true)
    }
  }, [step])

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        endTour()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        prevStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [endTour, nextStep, prevStep])

  // Ni cible trouvée, ni « définitivement absente » → on cherche encore (bref).
  if (!targetRect && !targetMissing) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
        <div className="animate-pulse text-white">{t('common.loading')}</div>
      </div>
    )
  }

  const highlightPadding = 8

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-visible">
      {targetRect ? (
        <>
          {/* Dark overlay with hole for target - plus lÃ©ger et permet le scroll */}
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - highlightPadding}
                  y={targetRect.top - highlightPadding}
                  width={targetRect.width + highlightPadding * 2}
                  height={targetRect.height + highlightPadding * 2}
                  rx="8"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(0, 0, 0, 0.4)"
              mask="url(#spotlight-mask)"
              style={{ pointerEvents: 'none' }}
            />
          </svg>

          {/* Highlight border */}
          <div
            className="absolute border-2 border-[#3B82F6] rounded-lg pointer-events-none animate-pulse"
            style={{
              top: targetRect.top - highlightPadding,
              left: targetRect.left - highlightPadding,
              width: targetRect.width + highlightPadding * 2,
              height: targetRect.height + highlightPadding * 2,
              boxShadow: '0 0 0 4px rgba(125, 194, 165, 0.3), 0 0 20px rgba(125, 194, 165, 0.5)'
            }}
          />
        </>
      ) : (
        // Cible absente : voile plein (pas de spotlight), la bulle est centrée.
        <div className="absolute inset-0 bg-black/40" style={{ pointerEvents: 'none' }} />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-white dark:bg-gray-900 rounded-xl shadow-2xl border overflow-hidden pointer-events-auto"
        style={tooltipStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#3B82F6] to-[#3B82F6]">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t('tour.step_x_of_y', { x: String(currentStep + 1), y: String(steps.length) })}
            </span>
          </div>
          <button
            onClick={endTour}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-2">{t(step.title, { appName: tenant.appName })}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t(step.description, { appName: tenant.appName })}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1 pb-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === currentStep
                  ? 'w-4 bg-[#3B82F6]'
                  : i < currentStep
                    ? 'w-1.5 bg-[#3B82F6]/50'
                    : 'w-1.5 bg-gray-200 dark:bg-gray-700'
              )}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-3 border-t bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={isFirstStep}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous')}
          </Button>

          <Button
            size="sm"
            onClick={nextStep}
            // Survol : un bleu plus soutenu. C'était `#6BB294` (un VERT), sans
            // rapport avec le bleu du bouton — le bouton changeait de couleur au
            // survol.
            className="gap-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white"
          >
            {isLastStep ? t('common.finish') : t('common.next')}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Button to start tour
export function StartTourButton({ className }: { className?: string }) {
  const { startTour } = useTour()
  const { t } = useTranslation()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={startTour}
      className={cn('gap-2', className)}
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">{t('tour.interactive_guide')}</span>
    </Button>
  )
}
