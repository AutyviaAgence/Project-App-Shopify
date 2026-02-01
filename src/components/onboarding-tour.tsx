'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  X,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  Smartphone,
  Bot,
  MessageSquare,
  Megaphone,
  BookOpen,
  Link2,
  Users,
  BarChart3,
  CheckCircle2,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TourStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  href: string
  tips: string[]
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Votre tableau de bord central pour voir toutes vos statistiques en un coup d\'œil.',
    icon: LayoutDashboard,
    href: '/dashboard',
    tips: [
      'Visualisez le nombre de messages envoyés/reçus',
      'Suivez vos conversations actives',
      'Consultez les tendances sur 7 jours'
    ]
  },
  {
    id: 'sessions',
    title: 'Sessions WhatsApp',
    description: 'Connectez vos comptes WhatsApp en scannant un QR code.',
    icon: Smartphone,
    href: '/sessions',
    tips: [
      'Cliquez sur "Nouvelle session" pour connecter un compte',
      'Scannez le QR code avec WhatsApp sur votre téléphone',
      'Définissez une limite quotidienne de messages IA'
    ]
  },
  {
    id: 'agents',
    title: 'Agents IA',
    description: 'Créez des agents intelligents qui répondent automatiquement à vos clients.',
    icon: Bot,
    href: '/agents',
    tips: [
      'Personnalisez le prompt système pour définir la personnalité',
      'Configurez les horaires de disponibilité',
      'Ajoutez un lien de prise de rendez-vous'
    ]
  },
  {
    id: 'conversations',
    title: 'Conversations',
    description: 'Consultez et gérez toutes vos conversations WhatsApp.',
    icon: MessageSquare,
    href: '/conversations',
    tips: [
      'Assignez un agent IA à une conversation',
      'Activez/désactivez l\'IA par conversation',
      'Utilisez les tags pour organiser vos échanges'
    ]
  },
  {
    id: 'campaigns',
    title: 'Campagnes',
    description: 'Envoyez des messages en masse avec des filtres intelligents.',
    icon: Megaphone,
    href: '/campaigns',
    tips: [
      'Ciblez par source, tags ou période d\'inactivité',
      'Configurez les délais anti-spam',
      'Suivez les taux de réponse en temps réel'
    ]
  },
  {
    id: 'knowledge',
    title: 'Base de connaissances',
    description: 'Enrichissez vos agents avec des documents PDF et textes.',
    icon: BookOpen,
    href: '/knowledge',
    tips: [
      'Uploadez des PDF (FAQ, catalogue, etc.)',
      'Associez les documents à vos agents',
      'L\'IA utilisera ces infos dans ses réponses'
    ]
  },
  {
    id: 'links',
    title: 'Liens WhatsApp',
    description: 'Créez des liens trackés pour mesurer vos sources de trafic.',
    icon: Link2,
    href: '/links',
    tips: [
      'Créez un lien par source (Facebook, Instagram...)',
      'Ajoutez un message pré-rempli',
      'Assignez automatiquement un agent IA'
    ]
  },
  {
    id: 'teams',
    title: 'Équipes',
    description: 'Collaborez avec votre équipe et partagez les ressources.',
    icon: Users,
    href: '/teams',
    tips: [
      'Invitez des membres avec un code',
      'Définissez les permissions par membre',
      'Partagez sessions, agents et documents'
    ]
  },
  {
    id: 'stats',
    title: 'Statistiques',
    description: 'Analysez vos performances avec des graphiques détaillés.',
    icon: BarChart3,
    href: '/stats',
    tips: [
      'Filtrez par période et session',
      'Comparez les performances de vos agents',
      'Exportez les données si besoin'
    ]
  }
]

interface OnboardingTourProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export function OnboardingTour({ isOpen, onClose, onComplete }: OnboardingTourProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]))

  const step = TOUR_STEPS[currentStep]
  const isLastStep = currentStep === TOUR_STEPS.length - 1
  const isFirstStep = currentStep === 0

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setVisitedSteps(new Set([0]))
    }
  }, [isOpen])

  const handleNext = () => {
    if (isLastStep) {
      onComplete()
    } else {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      setVisitedSteps(prev => new Set([...prev, nextStep]))
    }
  }

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleGoToPage = () => {
    router.push(step.href)
    onClose()
  }

  const handleStepClick = (index: number) => {
    setCurrentStep(index)
    setVisitedSteps(prev => new Set([...prev, index]))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Tour Card */}
      <Card className="relative z-10 w-full max-w-lg mx-4 shadow-2xl border-0 overflow-hidden">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div
            className="h-full bg-gradient-to-r from-[#7DC2A5] to-[#40E9BE] transition-all duration-300"
            style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <CardHeader className="pt-8 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#7DC2A5] to-[#40E9BE] text-white">
              <step.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Étape {currentStep + 1} sur {TOUR_STEPS.length}
              </p>
              <CardTitle className="text-xl">{step.title}</CardTitle>
            </div>
          </div>
          <CardDescription className="text-base mt-2">
            {step.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-4">
          {/* Tips */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              Astuces
            </p>
            <ul className="space-y-2">
              {step.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#7DC2A5] shrink-0" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-1.5 mt-6">
            {TOUR_STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => handleStepClick(index)}
                className={cn(
                  'h-2 rounded-full transition-all duration-200',
                  index === currentStep
                    ? 'w-6 bg-[#7DC2A5]'
                    : visitedSteps.has(index)
                      ? 'w-2 bg-[#7DC2A5]/50 hover:bg-[#7DC2A5]/70'
                      : 'w-2 bg-muted hover:bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between gap-2 pt-2 border-t bg-muted/30">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Précédent
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToPage}
            >
              Voir la page
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1 bg-[#7DC2A5] hover:bg-[#6BB294]"
            >
              {isLastStep ? (
                <>
                  Terminer
                  <CheckCircle2 className="h-4 w-4" />
                </>
              ) : (
                <>
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

// Hook to manage tour state
export function useOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false)
  const [hasCompletedTour, setHasCompletedTour] = useState(true) // Default to true to prevent flash

  useEffect(() => {
    const completed = localStorage.getItem('autyvia_tour_completed')
    setHasCompletedTour(completed === 'true')
  }, [])

  const openTour = () => setIsOpen(true)
  const closeTour = () => setIsOpen(false)

  const completeTour = () => {
    localStorage.setItem('autyvia_tour_completed', 'true')
    setHasCompletedTour(true)
    setIsOpen(false)
  }

  const resetTour = () => {
    localStorage.removeItem('autyvia_tour_completed')
    setHasCompletedTour(false)
  }

  return {
    isOpen,
    hasCompletedTour,
    openTour,
    closeTour,
    completeTour,
    resetTour
  }
}
