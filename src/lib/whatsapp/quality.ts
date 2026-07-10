import 'server-only'

/**
 * Cœur de la surveillance qualité WhatsApp.
 *
 * Une seule fonction applique un nouvel état de qualité/palier à une session,
 * qu'il vienne d'un webhook Meta temps réel ou du cron de secours. Elle stocke
 * l'état et déclenche les réactions automatiques (pause marketing sur ROUGE,
 * alertes dashboard dédupliquées, alerte positive à la montée de palier).
 */

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'

type SessionState = {
  id: string
  user_id: string | null
  quality_rating: string | null
  messaging_limit_tier: string | null
  marketing_paused: boolean | null
}

/** Insère une alerte dashboard au plus une fois par jour et par type. */
async function alertOncePerDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  alertType: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>
) {
  const since = new Date(); since.setHours(0, 0, 0, 0)
  const { count } = await admin
    .from('user_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('alert_type', alertType)
    .gte('created_at', since.toISOString())
  if ((count ?? 0) > 0) return
  await admin.from('user_alerts').insert({ user_id: userId, alert_type: alertType, title, message, metadata })
}

/**
 * Applique une mise à jour de santé à une session WhatsApp.
 * `quality` et/ou `tier` peuvent être null (mise à jour partielle).
 * Renvoie l'état effectif après application.
 */
export async function applyQualityUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  session: SessionState,
  next: { quality?: string | null; tier?: string | null }
): Promise<{ quality: QualityRating; tier: string | null; marketingPaused: boolean }> {
  const prevQuality = (session.quality_rating || 'UNKNOWN').toUpperCase()
  const prevTier = session.messaging_limit_tier || null
  const quality = (next.quality ?? session.quality_rating ?? 'UNKNOWN').toUpperCase() as QualityRating
  const tier = next.tier ?? session.messaging_limit_tier ?? null

  // Réaction : le marketing est mis en pause AUTO tant que la qualité est ROUGE.
  const marketingPaused = quality === 'RED'

  const update: Record<string, unknown> = {
    quality_rating: quality,
    messaging_limit_tier: tier,
    quality_updated_at: new Date().toISOString(),
    marketing_paused: marketingPaused,
  }
  await admin.from('whatsapp_sessions').update(update).eq('id', session.id)

  const userId = session.user_id
  if (userId) {
    // ROUGE : marketing coupé (nouveau passage seulement)
    if (quality === 'RED' && prevQuality !== 'RED') {
      await alertOncePerDay(admin, userId, 'whatsapp_quality',
        'Qualité WhatsApp CRITIQUE, marketing suspendu',
        'Meta a classé votre numéro en qualité ROUGE. Xeyo a automatiquement suspendu les envois marketing (paniers abandonnés, campagnes) pour protéger votre numéro. Le SAV et les messages transactionnels continuent. Réactivation automatique dès le retour au vert.',
        { quality, tier })
    } else if (quality === 'YELLOW' && prevQuality !== 'YELLOW') {
      await alertOncePerDay(admin, userId, 'whatsapp_quality',
        'Qualité WhatsApp en baisse',
        'Meta a classé votre numéro en qualité JAUNE (blocages/signalements en hausse). Réduisez le volume de templates marketing et vérifiez le consentement de vos contacts.',
        { quality, tier })
    } else if (quality === 'GREEN' && (prevQuality === 'RED' || prevQuality === 'YELLOW')) {
      await alertOncePerDay(admin, userId, 'whatsapp_quality_recovered',
        'Qualité WhatsApp rétablie',
        'Votre numéro est repassé en qualité VERTE. Les envois marketing sont réactivés.',
        { quality, tier })
    }
    // Montée de palier
    if (tier && prevTier && tier !== prevTier && tierValue(tier) > tierValue(prevTier)) {
      await alertOncePerDay(admin, userId, 'whatsapp_tier_up',
        'Votre limite d\'envoi WhatsApp a augmenté 🎉',
        `Meta a relevé votre plafond d'envois à ${tierLabel(tier)}. Vous pouvez toucher plus de contacts par jour.`,
        { tier, prevTier })
    }
  }

  return { quality, tier, marketingPaused }
}

const TIER_ORDER: Record<string, number> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: 1e9,
}
export function tierValue(tier: string | null): number {
  return tier ? (TIER_ORDER[tier] ?? 0) : 0
}
const TIER_LABELS: Record<string, string> = {
  TIER_50: '50 / 24h', TIER_250: '250 / 24h', TIER_1K: '1 000 / 24h',
  TIER_2K: '2 000 / 24h', TIER_10K: '10 000 / 24h', TIER_100K: '100 000 / 24h', TIER_UNLIMITED: 'Illimité',
}
export function tierLabel(tier: string | null): string {
  return tier ? (TIER_LABELS[tier] || tier) : ''
}

/** Événement Meta phone_number_quality_update → rating normalisé. */
export function normalizeQualityEvent(event: string | undefined): QualityRating | null {
  if (!event) return null
  const e = event.toUpperCase()
  // Meta envoie soit GREEN/YELLOW/RED, soit FLAGGED (≈ red)/UNFLAGGED (≈ green).
  if (e === 'GREEN' || e === 'HIGH' || e === 'UNFLAGGED') return 'GREEN'
  if (e === 'YELLOW' || e === 'MEDIUM' || e === 'ONBOARDING') return 'YELLOW'
  if (e === 'RED' || e === 'LOW' || e === 'FLAGGED') return 'RED'
  return null
}
