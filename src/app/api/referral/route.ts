import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getEffectiveUserId } from '@/lib/admin/impersonation'

// IMPERSONATION : données de l'utilisateur EFFECTIF. La route lit tout via le
// client admin (createAdminClient), on prend juste l'id effectif.
export async function GET() {
  const userId = await getEffectiveUserId()
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = await createAdminClient()

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single() as { data: { referral_code: string | null } | null }

  const referralCode = profile?.referral_code

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rewards } = await (adminSupabase as any)
    .from('referral_rewards')
    .select('*')
    .or(`referrer_id.eq.${userId},referee_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  const { data: referees } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, created_at, subscription_status')
    .eq('referred_by', userId)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    referral_code: referralCode,
    referral_link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.autyvia.fr'}/r/${referralCode}`,
    rewards: rewards || [],
    referees: referees || [],
    total_tokens_earned: (rewards || [])
      .filter((r: { rewarded_user_id: string }) => r.rewarded_user_id === userId)
      .reduce((sum: number, r: { tokens_credited: number }) => sum + (r.tokens_credited || 0), 0),
  })
}
