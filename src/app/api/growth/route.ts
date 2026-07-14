import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * GET /api/growth — ce que l'utilisateur a gagné en amenant des marchands.
 *
 * Sert AUSSI BIEN la page de parrainage (/referral) que la page partenaire
 * (/partner) : c'est le même moteur, seule la nature de la récompense change.
 *
 * ⚠️ Il n'existait AUCUNE page partenaire. Les commissions d'affiliation
 * n'étaient lisibles que par l'admin — un partenaire ne pouvait pas savoir ce
 * qu'on lui devait, ni même si son lien fonctionnait (et il ne fonctionnait pas).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Les codes que porte cet utilisateur. Il peut en avoir deux : son code de
  // parrainage (créé automatiquement) et, s'il est partenaire, un code d'affilié.
  const { data: codes } = await admin
    .from('growth_codes')
    .select('id, kind, code, label, commission_percent, reward_months, is_active')
    .eq('owner_user_id', user.id)
    .eq('is_active', true)

  const referralCode = codes?.find((c) => c.kind === 'referral') ?? null
  const affiliateCode = codes?.find((c) => c.kind === 'affiliate') ?? null

  const codeIds = (codes || []).map((c) => c.id)

  // Les marchands amenés par ses codes.
  const { data: attributions } = codeIds.length
    ? await admin
        .from('growth_attributions')
        .select('id, code_id, referee_id, attributed_at, converted_at')
        .in('code_id', codeIds)
        .order('attributed_at', { ascending: false })
    : { data: [] }

  // Ses récompenses (mois offerts, crédits, commissions).
  const { data: rewards } = await admin
    .from('growth_rewards')
    .select('id, reward_type, months, credits, amount_cents, currency, status, created_at, paid_at, granted_at')
    .eq('beneficiary_user_id', user.id)
    .order('created_at', { ascending: false })

  const list = rewards || []

  // ⚠️ Aucune donnée personnelle des filleuls n'est renvoyée (ni email, ni nom) :
  // savoir COMBIEN de marchands on a amenés suffit. Les identifier serait une
  // fuite — un partenaire n'a pas à connaître les clients de la plateforme.
  const referees = (attributions || []).length
  const converted = (attributions || []).filter((a) => a.converted_at).length

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

  return NextResponse.json({
    data: {
      referral: referralCode
        ? {
            code: referralCode.code,
            link: `${appUrl}/r/${referralCode.code}`,
            rewardMonths: referralCode.reward_months,
          }
        : null,

      // `null` si l'utilisateur n'est pas partenaire — la page /partner s'en sert
      // pour savoir si elle a quelque chose à afficher.
      affiliate: affiliateCode
        ? {
            code: affiliateCode.code,
            label: affiliateCode.label,
            link: `${appUrl}/r/${affiliateCode.code}`,
            commissionPercent: affiliateCode.commission_percent,
          }
        : null,

      stats: {
        /** Marchands inscrits via un de ses liens. */
        signups: referees,
        /** Ceux qui ont réellement payé — c'est ce qui déclenche la récompense. */
        converted,
      },

      rewards: list.map((r) => ({
        id: r.id,
        type: r.reward_type,
        months: r.months,
        credits: r.credits,
        amountCents: r.amount_cents,
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
        paidAt: r.paid_at,
        grantedAt: r.granted_at,
      })),

      totals: {
        freeMonths: list
          .filter((r) => r.reward_type === 'free_months' && r.status === 'granted')
          .reduce((sum, r) => sum + (r.months || 0), 0),
        aiCredits: list
          .filter((r) => r.reward_type === 'ai_credits' && r.status === 'granted')
          .reduce((sum, r) => sum + (r.credits || 0), 0),
        /** Commissions en attente de versement. */
        commissionPendingCents: list
          .filter((r) => r.reward_type === 'commission' && r.status === 'pending')
          .reduce((sum, r) => sum + (r.amount_cents || 0), 0),
        /** Commissions déjà versées. */
        commissionPaidCents: list
          .filter((r) => r.reward_type === 'commission' && r.status === 'paid')
          .reduce((sum, r) => sum + (r.amount_cents || 0), 0),
      },
    },
  })
}
