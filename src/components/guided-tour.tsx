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

// Tour steps configuration
const TOUR_STEPS: TourStep[] = [
  // Dashboard
  {
    id: 'welcome',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'Bienvenue sur Autyvia !',
    description: 'Ce guide va vous montrer les fonctionnalités principales de la plateforme. Suivez les étapes pour découvrir comment automatiser vos conversations WhatsApp.',
    position: 'bottom'
  },
  {
    id: 'dashboard-kpi',
    page: '/dashboard',
    target: '[data-tour="kpi-cards"]',
    title: 'Vos statistiques clés',
    description: 'Visualisez en un coup d\'œil vos messages, conversations actives, nouveaux contacts et taux de réponse IA.',
    position: 'bottom'
  },
  {
    id: 'dashboard-quick-stats',
    page: '/dashboard',
    target: '[data-tour="quick-stats"]',
    title: 'Accès rapide',
    description: 'Accédez rapidement à vos sessions WhatsApp, agents IA et liens de tracking. Cliquez sur une carte pour aller à la page correspondante.',
    position: 'top'
  },
  // Sessions
  {
    id: 'sessions-page',
    page: '/sessions',
    target: '[data-tour="sessions-header"]',
    title: 'Sessions WhatsApp',
    description: 'C\'est ici que vous connectez vos comptes WhatsApp. Chaque session représente un numéro de téléphone.',
    position: 'bottom'
  },
  {
    id: 'sessions-new',
    page: '/sessions',
    target: '[data-tour="new-session-btn"]',
    title: 'Nouvelle session',
    description: 'Cliquez ici pour connecter un nouveau compte WhatsApp. Vous devrez scanner un QR code avec votre téléphone.',
    position: 'left'
  },
  // Agents
  {
    id: 'agents-page',
    page: '/agents',
    target: '[data-tour="agents-header"]',
    title: 'Agents IA',
    description: 'Les agents IA répondent automatiquement à vos clients. Vous pouvez créer plusieurs agents avec des personnalités différentes.',
    position: 'bottom'
  },
  {
    id: 'agents-new',
    page: '/agents',
    target: '[data-tour="new-agent-btn"]',
    title: 'Créer un agent',
    description: 'Cliquez ici pour créer un nouvel agent. Vous pourrez définir sa personnalité, ses horaires et son comportement.',
    position: 'left'
  },
  // Conversations
  {
    id: 'conversations-page',
    page: '/conversations',
    target: '[data-tour="conversations-header"]',
    title: 'Conversations',
    description: 'Consultez toutes vos conversations WhatsApp. Vous pouvez voir les messages, assigner un agent IA ou répondre manuellement.',
    position: 'bottom'
  },
  {
    id: 'conversations-filters',
    page: '/conversations',
    target: '[data-tour="conversations-filters"]',
    title: 'Filtres et recherche',
    description: 'Filtrez vos conversations par session, par activité IA, ou recherchez un contact spécifique.',
    position: 'bottom'
  },
  // Campaigns
  {
    id: 'campaigns-page',
    page: '/campaigns',
    target: '[data-tour="campaigns-header"]',
    title: 'Campagnes',
    description: 'Envoyez des messages en masse à vos contacts. Idéal pour les relances, promotions ou informations importantes.',
    position: 'bottom'
  },
  {
    id: 'campaigns-new',
    page: '/campaigns',
    target: '[data-tour="new-campaign-btn"]',
    title: 'Nouvelle campagne',
    description: 'Créez une campagne avec des filtres (tags, inactivité, source) et des protections anti-spam intégrées.',
    position: 'left'
  },
  // Knowledge
  {
    id: 'knowledge-page',
    page: '/knowledge',
    target: '[data-tour="knowledge-header"]',
    title: 'Base de connaissances',
    description: 'Enrichissez vos agents avec des documents. L\'IA utilisera ces informations pour répondre plus précisément.',
    position: 'bottom'
  },
  {
    id: 'knowledge-upload',
    page: '/knowledge',
    target: '[data-tour="upload-btn"]',
    title: 'Ajouter un document',
    description: 'Uploadez un PDF (FAQ, catalogue, conditions) ou collez du texte. Le document sera automatiquement analysé.',
    position: 'left'
  },
  // Links
  {
    id: 'links-page',
    page: '/links',
    target: '[data-tour="links-header"]',
    title: 'Liens WhatsApp',
    description: 'Créez des liens wa.me trackés pour mesurer d\'où viennent vos contacts (Facebook, Instagram, Google...).',
    position: 'bottom'
  },
  {
    id: 'links-new',
    page: '/links',
    target: '[data-tour="new-link-btn"]',
    title: 'Créer un lien',
    description: 'Chaque lien peut avoir un message pré-rempli et un agent IA assigné automatiquement.',
    position: 'left'
  },
  // Teams
  {
    id: 'teams-page',
    page: '/teams',
    target: '[data-tour="teams-header"]',
    title: 'Équipes',
    description: 'Collaborez avec votre équipe. Partagez sessions, agents et documents avec des permissions personnalisées.',
    position: 'bottom'
  },
  // End
  {
    id: 'tour-end',
    page: '/dashboard',
    target: '[data-tour="header"]',
    title: 'C\'est parti !',
    description: 'Vous connaissez maintenant les bases d\'Autyvia. Commencez par connecter une session WhatsApp, puis créez votre premier agent IA !',
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
    const findTarget = () => {
      const target = document.querySelector(step.target)
      if (target) {
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
      } else {
        setTargetRect(null)
      }
    }

    // Initial find
    const timer = setTimeout(findTarget, 100)

    // Listen for resize/scroll
    window.addEventListener('resize', findTarget)
    window.addEventListener('scroll', findTarget, true)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', findTarget)
      window.removeEventListener('scroll', findTarget, true)
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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
        <div className="animate-pulse text-white">Chargement...</div>
      </div>
    )
  }

  const highlightPadding = 8

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dark overlay with hole for target */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={endTour}>
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
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
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
