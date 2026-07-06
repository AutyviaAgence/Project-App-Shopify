import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/agents/onboard/status
 *
 * Indique s'il faut déclencher l'onboarding e-commerce pré-rempli de l'agent.
 * Réponse `{ shouldOnboard: true }` UNIQUEMENT si :
 *   - une boutique Shopify est connectée (active), ET
 *   - le marchand n'a pas encore validé son agent (`agent_onboarding_done` false).
 * Sert au déclenchement automatique au 1er accès après connexion.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ shouldOnboard: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('agent_onboarding_done')
    .eq('id', user.id)
    .maybeSingle()

  // Déjà onboardé → rien à faire.
  if (profile?.agent_onboarding_done) return NextResponse.json({ shouldOnboard: false })

  // Boutique connectée & active ?
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({ shouldOnboard: Boolean(store) })
}
