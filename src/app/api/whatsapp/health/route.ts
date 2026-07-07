import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptWabaToken } from '@/lib/messaging/send'

/**
 * GET /api/whatsapp/health
 * Santé du numéro WhatsApp du marchand, lue en direct chez Meta :
 *  - quality : GREEN | YELLOW | RED (blocages/signalements des destinataires)
 *  - tier    : palier d'envois initiés par l'entreprise / 24h
 * Si la qualité passe YELLOW/RED → alerte dashboard (1 par jour max).
 * Crucial pour l'e-commerce : gros volumes de templates = risque de
 * restriction Meta si la qualité se dégrade sans qu'on le voie.
 */
const TIER_LABELS: Record<string, string> = {
  TIER_50: '50 / 24h',
  TIER_250: '250 / 24h',
  TIER_1K: '1 000 / 24h',
  TIER_2K: '2 000 / 24h',
  TIER_10K: '10 000 / 24h',
  TIER_100K: '100 000 / 24h',
  TIER_UNLIMITED: 'Illimité',
}

/** Valeur numérique du palier (null = illimité/inconnu). */
const TIER_VALUES: Record<string, number> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000,
  TIER_10K: 10000, TIER_100K: 100000,
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (supabase as any)
    .from('whatsapp_sessions')
    .select('id, user_id, waba_phone_number_id, waba_access_token, quality_rating, messaging_limit_tier, quality_updated_at, marketing_paused')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .maybeSingle()
  if (!session?.waba_phone_number_id) {
    return NextResponse.json({ data: { connected: false } })
  }

  // État STOCKÉ (rafraîchi en continu par les webhooks + le sweep) : source
  // principale. On ne rappelle Meta en direct que s'il est absent ou vieux (>1h).
  const storedAge = session.quality_updated_at
    ? Date.now() - new Date(session.quality_updated_at).getTime()
    : Infinity
  let quality = (session.quality_rating || 'UNKNOWN').toUpperCase()
  let tier = session.messaging_limit_tier || null
  let marketingPaused = Boolean(session.marketing_paused)
  let nameStatus: string | null = null

  // Appel live si l'état stocké est absent/vieux, OU si le palier est inconnu
  // (le cas « nom refusé » : on veut alors récupérer name_status pour l'expliquer).
  if (!session.quality_rating || !tier || storedAge > 60 * 60 * 1000) {
    const token = decryptWabaToken(session)
    if (token) {
      const res = await wabaClient.getPhoneNumberHealth(session.waba_phone_number_id, token)
      if (res.ok) {
        nameStatus = (res.data.name_status || '').toUpperCase() || null
        const { applyQualityUpdate } = await import('@/lib/whatsapp/quality')
        const applied = await applyQualityUpdate(supabase, session, {
          quality: res.data.quality_rating || undefined,
          tier: res.data.messaging_limit_tier || undefined,
        })
        quality = applied.quality
        tier = applied.tier
        marketingPaused = applied.marketingPaused
      }
    }
  }

  // Utilisation : contacts UNIQUES joints par les automatisations sur les
  // dernières 24h GLISSANTES — la sémantique exacte de la limite Meta
  // (les réponses SAV en fenêtre 24h ne comptent pas, comme chez Meta).
  let used = 0
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jobs } = await (supabase as any)
      .from('automation_jobs')
      .select('contact_id')
      .eq('user_id', user.id)
      .eq('status', 'sent')
      .gte('processed_at', since)
      .limit(10000)
    used = new Set((jobs || []).map((j: { contact_id: string }) => j.contact_id).filter(Boolean)).size
  } catch { /* compteur best effort */ }

  // Les alertes (qualité, montée de palier) sont gérées par applyQualityUpdate
  // — pas de duplication ici.

  return NextResponse.json({
    data: {
      connected: true,
      quality, // GREEN | YELLOW | RED | UNKNOWN
      tier,
      tierLabel: tier ? (TIER_LABELS[tier] || tier) : null,
      /** Contacts uniques joints (automatisations) sur 24h glissantes */
      used,
      /** Plafond numérique du palier (null = illimité ou palier inconnu) */
      limit: tier ? (TIER_VALUES[tier] ?? null) : null,
      /** Marketing suspendu automatiquement (qualité ROUGE) */
      marketingPaused,
      /** Nom d'affichage refusé → palier bloqué chez Meta (à corriger) */
      nameDeclined: nameStatus === 'DECLINED',
    },
  })
}
