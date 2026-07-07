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
  TIER_10K: '10 000 / 24h',
  TIER_100K: '100 000 / 24h',
  TIER_UNLIMITED: 'Illimité',
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
    },
  })
}
