import 'server-only'

import { evolution } from '@/lib/evolution/client'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import type { WhatsAppSession } from '@/types/database'

type SendResult = { ok: true; data: unknown } | { ok: false; error: string }

/**
 * Envoyer un message texte via la bonne intégration (Evolution ou WABA)
 * selon le type de session.
 */
export async function sendMessage(
  session: Pick<WhatsAppSession, 'integration_type' | 'instance_name' | 'waba_phone_number_id' | 'waba_access_token'>,
  phoneNumber: string,
  text: string
): Promise<SendResult> {
  if (session.integration_type === 'waba') {
    if (!session.waba_phone_number_id || !session.waba_access_token) {
      return { ok: false, error: 'Credentials WABA manquants sur la session' }
    }
    return wabaClient.sendText(
      session.waba_phone_number_id,
      session.waba_access_token,
      phoneNumber,
      text
    )
  }

  // Par défaut : Evolution API
  return evolution.sendText(session.instance_name, phoneNumber, text)
}

/**
 * Envoyer un indicateur de présence (typing indicator).
 * Pour WABA, il n'y a pas d'équivalent direct, donc on no-op.
 */
export async function sendPresence(
  session: Pick<WhatsAppSession, 'integration_type' | 'instance_name'>,
  phoneNumber: string,
  presence: 'composing' | 'paused',
  delay?: number
): Promise<void> {
  if (session.integration_type === 'waba') {
    // WhatsApp Cloud API n'a pas de typing indicator natif
    return
  }

  await evolution.sendPresence(session.instance_name, phoneNumber, presence, delay)
}
