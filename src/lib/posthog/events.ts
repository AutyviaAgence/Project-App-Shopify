'use client'

import posthog from 'posthog-js'

/**
 * Événements métier (funnels). Centralisés ici pour cohérence des noms.
 * Usage : `import { track } from '@/lib/posthog/events'; track('agent_created', {...})`
 */
export type XeyoEvent =
  // Agents & IA
  | 'agent_created'
  | 'agent_tested'
  | 'agent_saved'
  | 'ai_toggle_changed'
  | 'auto_tag_enabled'
  // Templates
  | 'template_created'
  | 'template_ai_generated'
  | 'template_submitted'
  | 'template_published'
  | 'template_sent'
  // Inbox & messages
  | 'conversation_opened'
  | 'message_sent'
  | 'template_sent_in_chat'
  | 'media_sent'
  // Connexions
  | 'whatsapp_connected'
  | 'shopify_connected'
  // Automatisations
  | 'automation_created'
  | 'automation_activated'
  | 'automation_saved'
  // Liens & widget
  | 'link_created'
  | 'qr_downloaded'
  // Monétisation
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
