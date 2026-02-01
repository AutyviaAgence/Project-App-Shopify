'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
interface TourStep {
  id: string
  page: string
  target: string // CSS selector
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  action?: 'click' | 'hover' | 'none'
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

// Tour steps configuration (réduit à 8 étapes essentielles)
const TOUR_STEPS: TourStep[] = [
  // Dashboard - Bienvenue
  {
    id: 'welcome',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'Bienvenue sur Autyvia !',
    description: 'Découvrez comment automatiser vos conversations WhatsApp en quelques étapes. Ce guide rapide vous présente les fonctionnalités essentielles.',
    position: 'bottom'
  },
  // Sessions - Connecter WhatsApp
  {
    id: 'sessions-page',
    page: '/sessions',
    target: '[data-tour="sessions-header"]',
    title: '1. Connectez WhatsApp',
    description: 'Commencez par connecter votre compte WhatsApp. Cliquez sur "Nouvelle session" et scannez le QR code avec votre téléphone.',
    position: 'bottom'
  },
  // Agents - Créer un agent IA
  {
    id: 'agents-page',
    page: '/agents',
    target: '[data-tour="agents-header"]',
    title: '2. Créez un agent IA',
    description: 'Les agents IA répondent automatiquement à vos clients 24h/24. Définissez leur personnalité, horaires et comportement.',
    position: 'bottom'
  },
  // Knowledge - Base de connaissances
  {
    id: 'knowledge-page',
    page: '/knowledge',
    target: '[data-tour="knowledge-header"]',
    title: '3. Enrichissez avec des documents',
    description: 'Uploadez vos FAQ, catalogues ou conditions. L\'IA utilisera ces informations pour répondre précisément aux questions.',
    position: 'bottom'
  },
  // Conversations
  {
    id: 'conversations-page',
    page: '/conversations',
    target: '[data-tour="conversations-header"]',
    title: '4. Gérez vos conversations',
    description: 'Consultez toutes vos conversations, assignez des agents IA ou prenez le relais manuellement quand nécessaire.',
    position: 'bottom'
  },
  // Links - Tracking
  {
    id: 'links-page',
    page: '/links',
    target: '[data-tour="links-header"]',
    title: '5. Trackez vos sources',
    description: 'Créez des liens WhatsApp personnalisés pour savoir d\'où viennent vos contacts (réseaux sociaux, Google, etc.).',
    position: 'bottom'
  },
  // Campaigns
  {
    id: 'campaigns-page',
    page: '/campaigns',
    target: '[data-tour="campaigns-header"]',
    title: '6. Lancez des campagnes',
    description: 'Envoyez des messages ciblés à vos contacts avec des filtres intelligents et des protections anti-spam intégrées.',
    position: 'bottom'
  },
  // End
  {
    id: 'tour-end',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'C\'est parti !',
    description: 'Vous êtes prêt ! Commencez par connecter une session WhatsApp, puis créez votre premier agent IA. Bon succès !',
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

// Provider
export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isNavigating, setIsNavigating] = useState(false)

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
    if (TOUR_STEPS[0].page !== pathname) {
      router.push(TOUR_STEPS[0].page)
    }
  }, [pathname, router])

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
  }, [currentStep, endTour])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }, [currentStep])

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < TOUR_STEPS.length) {
      setCurrentStep(index)
    }
  }, [])

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      steps: TOUR_STEPS,
      startTour,
      endTour,
      nextStep,
      prevStep,
      goToStep
    }}>
      {children}
      {isActive && !isNavigating && <TourOverlay />}
    </TourContext.Provider>
  )
}

// Overlay component that highlights elements
function TourOverlay() {
  const { currentStep, steps, nextStep, prevStep, endTour } = useTour()
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
        <div className="animate-pulse text-white">Chargement...</div>
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
              Étape {currentStep + 1} / {steps.length}
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
          <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.description}
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
            Précédent
          </Button>

          <Button
            size="sm"
            onClick={nextStep}
            className="gap-1 bg-[#7DC2A5] hover:bg-[#6BB294] text-white"
          >
            {isLastStep ? 'Terminer' : 'Suivant'}
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={startTour}
      className={cn('gap-2', className)}
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">Guide interactif</span>
    </Button>
  )
}
