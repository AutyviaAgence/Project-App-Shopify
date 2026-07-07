import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
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

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_phone_number_id, waba_access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .maybeSingle()
  if (!session?.waba_phone_number_id) {
    return NextResponse.json({ data: { connected: false } })
  }

  const token = decryptWabaToken(session)
  if (!token) return NextResponse.json({ data: { connected: false } })

  const res = await wabaClient.getPhoneNumberHealth(session.waba_phone_number_id, token)
  if (!res.ok) {
    return NextResponse.json({ data: { connected: true, quality: null, tier: null } })
  }

  const quality = (res.data.quality_rating || 'UNKNOWN').toUpperCase()
  const tier = res.data.messaging_limit_tier || null

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

  // Alerte si la qualité se dégrade (dédupliquée : 1 par jour max).
  if (quality === 'YELLOW' || quality === 'RED') {
    try {
      const admin = createAdminSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const since = new Date(); since.setHours(0, 0, 0, 0)
      const { count } = await admin
        .from('user_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('alert_type', 'whatsapp_quality')
        .gte('created_at', since.toISOString())
      if ((count ?? 0) === 0) {
        await admin.from('user_alerts').insert({
          user_id: user.id,
          alert_type: 'whatsapp_quality',
          title: quality === 'RED' ? 'Qualité WhatsApp CRITIQUE' : 'Qualité WhatsApp en baisse',
          message: quality === 'RED'
            ? 'Meta a classé votre numéro en qualité ROUGE : risque imminent de restriction. Suspendez les envois marketing (paniers abandonnés, campagnes) quelques jours et privilégiez les réponses SAV.'
            : 'Meta a classé votre numéro en qualité JAUNE (blocages/signalements en hausse). Réduisez le volume de templates marketing et vérifiez le consentement de vos contacts.',
          metadata: { quality, tier },
        })
      }
    } catch { /* best effort */ }
  }

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
    },
  })
}
