'use client'

import posthog from 'posthog-js'

/**
 * Événements métier (funnels). Centralisés ici pour cohérence des noms.
 * Usage : `import { track } from '@/lib/posthog/events'; track('agent_created', {...})`
 */
export type XeyoEvent =
  | 'agent_created'
  | 'agent_tested'
  | 'template_created'
  | 'template_sent'
  | 'whatsapp_connected'
  | 'shopify_connected'
  | 'automation_created'
  | 'automation_activated'
  | 'link_created'
  | 'subscription_started'

export function track(event: XeyoEvent, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try { posthog.capture(event, props) } catch { /* no-op */ }
}

/** Identifie le marchand connecté (relie tous ses events à son compte). */
export function identifyMerchant(userId: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !userId) return
  try { posthog.identify(userId, props) } catch { /* no-op */ }
}

/** À appeler à la déconnexion pour ne pas mélanger les sessions. */
export function resetAnalytics() {
  if (typeof window === 'undefined') return
  try { posthog.reset() } catch { /* no-op */ }
}
