import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .single() as { data: { referral_code: string | null } | null }

  const referralCode = profile?.referral_code

  const { data: rewards } = await adminSupabase
    .from('referral_rewards')
    .select('*')
    .or(`referrer_id.eq.${user.id},referee_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const { data: referees } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, created_at, subscription_status')
    .eq('referred_by', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    referral_code: referralCode,
    referral_link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.autyvia.fr'}/r/${referralCode}`,
    rewards: rewards || [],
    referees: referees || [],
    total_tokens_earned: (rewards || [])
      .filter((r: { rewarded_user_id: string }) => r.rewarded_user_id === user.id)
      .reduce((sum: number, r: { tokens_credited: number }) => sum + (r.tokens_credited || 0), 0),
  })
}
