import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fenêtre de service WhatsApp de 24h.
 *
 * Règle Meta : on ne peut envoyer du texte libre (réponses IA incluses) QUE
 * dans les 24h suivant le dernier message ENTRANT du client. Au-delà, seul un
 * TEMPLATE pré-approuvé peut (r)ouvrir la conversation.
 *
 * Ce helper centralise la détection pour que l'app choisisse automatiquement
 * entre réponse libre (IA) et template.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000

export type WindowState = {
  /** true si on est dans les 24h depuis le dernier message entrant */
  isOpen: boolean
  /** date du dernier message entrant, ou null si aucun */
  lastInboundAt: Date | null
  /** ms restantes avant fermeture (0 si fermée) */
  msRemaining: number
}

/** Calcule l'état de la fenêtre à partir de la date du dernier message entrant. */
export function computeWindowState(lastInboundAt: Date | null, now: Date = new Date()): WindowState {
  if (!lastInboundAt) {
    return { isOpen: false, lastInboundAt: null, msRemaining: 0 }
  }
  const elapsed = now.getTime() - lastInboundAt.getTime()
  const remaining = WINDOW_MS - elapsed
  return {
    isOpen: remaining > 0,
    lastInboundAt,
    msRemaining: Math.max(0, remaining),
  }
}

/**
 * Récupère l'état de la fenêtre 24h pour une conversation en DB.
 * Se base sur le dernier message `direction = 'inbound'`.
 */
export async function getConversationWindow(
  supabase: SupabaseClient,
  conversationId: string,
  now: Date = new Date()
): Promise<WindowState> {
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastInboundAt = data?.created_at ? new Date(data.created_at) : null
  return computeWindowState(lastInboundAt, now)
}
