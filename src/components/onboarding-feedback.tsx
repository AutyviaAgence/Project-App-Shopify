'use client'

import { Check } from 'lucide-react'

/**
 * Voile plein écran + badge de félicitation animé, affiché entre deux étapes
 * d'un questionnaire d'onboarding. Le voile flouté MASQUE le contenu derrière
 * → l'animation ne chevauche plus jamais le texte.
 */
export function OnboardingFeedback({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Voile flouté qui masque le contenu */}
      <div className="animate-feedback-veil absolute inset-0 bg-background/70 backdrop-blur-md" />
      {/* Badge */}
      <div className="animate-feedback-pop relative flex flex-col items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
          <Check className="animate-check-pop h-8 w-8 text-primary" strokeWidth={3} />
        </span>
        <p className="max-w-xs text-center text-lg font-semibold text-foreground">{message}</p>
      </div>
    </div>
  )
}
