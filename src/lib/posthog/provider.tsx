'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
// Hôte d'ingestion : reverse-proxy /ingest (évite les bloqueurs) ; fallback EU cloud.
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest'

let initialized = false

function initPostHog() {
  if (initialized || typeof window === 'undefined' || !KEY) return
  initialized = true
  posthog.init(KEY, {
    api_host: HOST,
    // L'UI PostHog vit sur eu.posthog.com même si l'ingestion passe par /ingest.
    ui_host: 'https://eu.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,   // on gère manuellement (App Router)
    capture_pageleave: true,
    autocapture: true,         // clics / soumissions auto
    // Session recordings + masquage des données sensibles (RGPD B2B).
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,                 // masque tous les champs de saisie
      maskTextSelector: '[data-ph-mask]',  // masque ce qui est marqué explicitement
    },
    // Heatmaps activées.
    enable_heatmaps: true,
    persistence: 'localStorage+cookie',
  })
}

/** Capture les pages vues à chaque changement de route (App Router). */
function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (!ph || !pathname) return
    let url = window.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += '?' + qs
    ph.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, ph])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { initPostHog() }, [])

  // Sans clé configurée → on ne charge pas PostHog (dev local, etc.).
  if (!KEY) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}><PostHogPageview /></Suspense>
      {children}
    </PHProvider>
  )
}
