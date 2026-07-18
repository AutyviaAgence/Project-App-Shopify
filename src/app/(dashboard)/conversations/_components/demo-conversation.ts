import type { ConversationWithJoins, Message } from './types'

/**
 * CONVERSATION DE DÉMO POUR LE TOUR GUIDÉ.
 *
 * ── POURQUOI ────────────────────────────────────────────────────────────────
 *
 * Le tour explique « Résumé IA », « toggle IA par conversation », « commandes du
 * client »… mais sur un compte neuf la page est vide : rien à pointer. On injecte
 * donc une conversation FACTICE, uniquement à l'affichage et uniquement PENDANT
 * le tour, pour que ces zones aient un contexte.
 *
 * ── ZÉRO EFFET RÉEL ─────────────────────────────────────────────────────────
 *
 * Elle n'existe PAS en base : jamais insérée, jamais envoyée sur WhatsApp, jamais
 * comptée dans les stats, ne déclenche ni IA ni automatisation. Son id commence
 * par `demo-` — repérable partout si besoin de la filtrer. À la fin du tour, on
 * cesse de l'injecter et elle disparaît.
 */

export const DEMO_CONVERSATION_ID = 'demo-xeyo-conversation'
export const DEMO_CONTACT_ID = 'demo-xeyo-contact'

/** Reconnaît la conversation de démo (pour ne JAMAIS l'appeler côté API). */
export function isDemoConversation(id: string | null | undefined): boolean {
  return !!id && id.startsWith('demo-')
}

/**
 * Construit la conversation de démo. On passe une session réelle si elle existe
 * (pour l'affichage), sinon des valeurs neutres — la conversation reste factice.
 */
export function makeDemoConversation(session?: {
  id: string; instance_name: string; phone_number: string | null
}): ConversationWithJoins {
  const now = new Date().toISOString()
  return {
    id: DEMO_CONVERSATION_ID,
    session_id: session?.id ?? 'demo-session',
    channel: 'whatsapp',
    contact_id: DEMO_CONTACT_ID,
    // Agent factice non-null : c'est ce qui fait APPARAÎTRE l'interrupteur IA dans
    // le header du chat (il n'est rendu que si ai_agent_id est présent). Sans lui,
    // l'étape « Activer/couper l'IA » du tour n'avait rien à pointer.
    ai_agent_id: 'demo-agent',
    last_message_at: now,
    last_message_preview: 'Bienvenue sur Xeyo.IO 👋',
    unread_count: 0,
    is_ai_active: true,
    is_pinned: false,
    lifecycle_stage_id: null,
    created_at: now,
    contact: {
      id: DEMO_CONTACT_ID,
      phone_number: '00000000000',
      email: null,
      name: 'Xeyo.IO',
      first_name: 'Xeyo',
      last_name: 'IO',
      profile_picture: null,
      opt_in_status: 'subscribed',
    },
    session: {
      id: session?.id ?? 'demo-session',
      instance_name: session?.instance_name ?? 'Démo',
      phone_number: session?.phone_number ?? null,
      team_id: null,
      team_name: null,
    },
    tags: [],
  }
}

/** Un message de bienvenue factice pour peupler le fil pendant le tour. */
export function makeDemoMessages(): Message[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'demo-msg-1',
      conversation_id: DEMO_CONVERSATION_ID,
      session_id: 'demo-session',
      direction: 'inbound',
      content: 'Bonjour Xeyo, je découvre votre boutique !',
      message_type: 'text',
      media_url: null,
      media_mime_type: null,
      transcription: null,
      wa_message_id: null,
      channel_message_id: null,
      sent_by: 'contact',
      ai_agent_id: null,
      status: 'delivered',
      reaction_emoji: null,
      ai_processed: false,
      read_at: null,
      automation_id: null,
      campaign_id: null,
      created_at: now,
    },
    {
      id: 'demo-msg-2',
      conversation_id: DEMO_CONVERSATION_ID,
      session_id: 'demo-session',
      direction: 'outbound',
      content: 'Bienvenue sur Xeyo.IO 👋 Je suis votre assistant : posez-moi une question sur nos produits ou votre commande, je réponds tout de suite !',
      message_type: 'text',
      media_url: null,
      media_mime_type: null,
      transcription: null,
      wa_message_id: null,
      channel_message_id: null,
      sent_by: 'ai_agent',
      ai_agent_id: null,
      status: 'sent',
      reaction_emoji: null,
      ai_processed: true,
      read_at: null,
      automation_id: null,
      campaign_id: null,
      created_at: now,
    },
  ]
}
