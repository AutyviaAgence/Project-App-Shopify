'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
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
  requiredPlan?: 'pro' | 'scale' // step masqué si le plan ne l'autorise pas
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

// Tour steps configuration - title/description hold i18n keys
const ALL_TOUR_STEPS: TourStep[] = [
  // Sessions
  {
    id: 'sessions-page',
    page: '/sessions',
    target: '[data-tour="sessions-header"]',
    title: 'tour.sessions_title',
    description: 'tour.sessions_desc',
    position: 'bottom'
  },
  {
    id: 'sessions-new',
    page: '/sessions',
    target: '[data-tour="new-session-btn"]',
    title: 'tour.connect_title',
    description: 'tour.connect_desc',
    position: 'left'
  },
  // Agents
  {
    id: 'agents-page',
    page: '/agents',
    target: '[data-tour="agents-header"]',
    title: 'tour.agents_title',
    description: 'tour.agents_desc',
    position: 'bottom'
  },
  {
    id: 'agents-new',
    page: '/agents',
    target: '[data-tour="new-agent-btn"]',
    title: 'tour.create_agent_title',
    description: 'tour.create_agent_desc',
    position: 'left'
  },
  // Knowledge
  {
    id: 'knowledge-page',
    page: '/knowledge',
    target: '[data-tour="knowledge-header"]',
    title: 'tour.knowledge_title',
    description: 'tour.knowledge_desc',
    position: 'bottom'
  },
  {
    id: 'knowledge-upload',
    page: '/knowledge',
    target: '[data-tour="upload-btn"]',
    title: 'tour.add_doc_title',
    description: 'tour.add_doc_desc',
    position: 'left'
  },
  // Conversations
  {
    id: 'conversations-page',
    page: '/conversations',
    target: '[data-tour="conversations-header"]',
    title: 'tour.conversations_title',
    description: 'tour.conversations_desc',
    position: 'bottom'
  },
  // Links
  {
    id: 'links-page',
    page: '/links',
    target: '[data-tour="links-header"]',
    title: 'tour.links_title',
    description: 'tour.links_desc',
    position: 'bottom'
  },
  // Campaigns — Scale uniquement
  {
    id: 'campaigns-page',
    page: '/campaigns',
    target: '[data-tour="campaigns-header"]',
    title: 'tour.campaigns_title',
    description: 'tour.campaigns_desc',
    position: 'bottom',
    requiredPlan: 'scale'
  },
  // Tags
  {
    id: 'tags-page',
    page: '/tags',
    target: '[data-tour="tags-header"]',
    title: 'tour.tags_title',
    description: 'tour.tags_desc',
    position: 'bottom'
  },
  // Lifecycle — Pro et Scale
  {
    id: 'lifecycle-page',
    page: '/lifecycle',
    target: '[data-tour="lifecycle-header"]',
    title: 'tour.lifecycle_title',
    description: 'tour.lifecycle_desc',
    position: 'bottom',
    requiredPlan: 'pro'
  },
  // Teams
  {
    id: 'teams-page',
    page: '/teams',
    target: '[data-tour="teams-header"]',
    title: 'tour.teams_title',
    description: 'tour.teams_desc',
    position: 'bottom'
  },
  // Stats
  {
    id: 'stats-page',
    page: '/stats',
    target: '[data-tour="stats-header"]',
    title: 'tour.stats_title',
    description: 'tour.stats_desc',
    position: 'bottom'
  },
  // Settings
  {
    id: 'settings-page',
    page: '/settings',
    target: '[data-tour="settings-header"]',
    title: 'tour.settings_title',
    description: 'tour.settings_desc',
    position: 'bottom'
  },
  // End
  {
    id: 'tour-end',
    page: '/sessions',
    target: '[data-tour="sessions-header"]',
    title: 'tour.ready_title',
    description: 'tour.ready_desc',
    position: 'bottom'
  }
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

  // Find and track target element
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 30 // Try for up to 3 seconds
    let retryTimer: NodeJS.Timeout | null = null

    const updatePosition = (target: Element) => {
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

  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
        <div className="animate-pulse text-white">{t('common.loading')}</div>
      </div>
    )
  }

  const highlightPadding = 8

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-visible">
      {/* Dark overlay with hole for target - plus léger et permet le scroll */}
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
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.4)"
          mask="url(#spotlight-mask)"
          style={{ pointerEvents: 'none' }}
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute border-2 border-[#7DC2A5] rounded-lg pointer-events-none animate-pulse"
        style={{
          top: targetRect.top - highlightPadding,
          left: targetRect.left - highlightPadding,
          width: targetRect.width + highlightPadding * 2,
          height: targetRect.height + highlightPadding * 2,
          boxShadow: '0 0 0 4px rgba(125, 194, 165, 0.3), 0 0 20px rgba(125, 194, 165, 0.5)'
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute bg-white dark:bg-gray-900 rounded-xl shadow-2xl border overflow-hidden pointer-events-auto"
        style={tooltipStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#7DC2A5] to-[#40E9BE]">
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
                  ? 'w-4 bg-[#7DC2A5]'
                  : i < currentStep
                    ? 'w-1.5 bg-[#7DC2A5]/50'
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
            className="gap-1 bg-[#7DC2A5] hover:bg-[#6BB294] text-white"
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
