import 'server-only'

/**
 * Filet de sécurité : relit la santé de TOUS les numéros WhatsApp connectés
 * directement chez Meta et applique l'état (via applyQualityUpdate).
 *
 * Pourquoi : chaque marchand a SA propre app Meta ; certains n'auront pas
 * abonné les webhooks de qualité. Le webhook reste la voie temps réel ; ce
 * balayage garantit qu'on n'est JAMAIS aveugle plus de ~1 jour.
 *
 * Throttlé à 1×/6h via un timestamp mémoire (mutualisé dans le cron principal).
 */
let lastSweep = 0
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

export async function sweepWhatsappHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  nowMs: number
): Promise<{ ran: boolean; checked: number }> {
  if (nowMs - lastSweep < SWEEP_INTERVAL_MS) return { ran: false, checked: 0 }
  lastSweep = nowMs

  const { wabaClient } = await import('@/lib/whatsapp-cloud/client')
  const { decryptWabaToken } = await import('@/lib/messaging/send')
  const { applyQualityUpdate } = await import('@/lib/whatsapp/quality')

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, waba_phone_number_id, waba_access_token, quality_rating, messaging_limit_tier, marketing_paused')
    .eq('integration_type', 'waba')
    .eq('status', 'connected')
    .limit(500)

  let checked = 0
  for (const s of sessions || []) {
    if (!s.waba_phone_number_id) continue
    const token = decryptWabaToken(s)
    if (!token) continue
    const res = await wabaClient.getPhoneNumberHealth(s.waba_phone_number_id, token)
    if (!res.ok) continue
    checked++
    await applyQualityUpdate(supabase, s, {
      quality: res.data.quality_rating || undefined,
      tier: res.data.messaging_limit_tier || undefined,
    })
  }
  return { ran: true, checked }
}
