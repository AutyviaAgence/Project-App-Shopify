import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/subscription — Récupérer le statut d'abonnement de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_status, trial_ends_at, subscription_ends_at, stripe_customer_id, stripe_subscription_id, tokens_used, tokens_limit, tokens_extra, plan, pending_plan, role, onboarding_status, onboarding_plan')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }

  // Récupérer si le configurateur a été soumis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: onboardingConfig } = await (supabase as any)
    .from('onboarding_configs')
    .select('submitted_at')
    .eq('user_id', user.id)
    .maybeSingle() as { data: { submitted_at: string | null } | null }

  return NextResponse.json({
    data: {
      ...profile,
      configurateur_submitted: !!onboardingConfig?.submitted_at,
    }
  })
}
