import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/onboarding/state
 *
 * Source de vérité de l'avancement du grand onboarding bloquant.
 * Le layout dashboard redirige vers /onboarding tant que `completed` est faux.
 * Les admins et les comptes grandfathered (migration) sont toujours `completed`.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('onboarding_completed_at, onboarding_step, onboarding_pack, agent_onboarding_done, plan, role')
    .eq('id', user.id)
    .maybeSingle()

  // FAIL-OPEN : si la colonne n'existe pas encore (migration non appliquée)
  // ou toute erreur de lecture → on ne bloque JAMAIS l'accès au dashboard.
  if (profileError || !profile) {
    return NextResponse.json({ completed: true, failOpen: true })
  }

  // Admins : jamais bloqués par l'onboarding.
  if (profile.role === 'admin') {
    return NextResponse.json({ completed: true, admin: true })
  }

  const completed = Boolean(profile.onboarding_completed_at)

  // Boutique Shopify liée + état de la 1ʳᵉ synchronisation.
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, shop_name, shop_domain, last_synced_at, last_sync_summary, billing_source')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  // WhatsApp connecté ?
  const { count: waCount } = await supabase
    .from('whatsapp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'connected')

  return NextResponse.json({
    completed,
    step: profile?.onboarding_step || null,
    shopifyLinked: Boolean(store),
    shopName: store?.shop_name || store?.shop_domain || null,
    shopDomain: store?.shop_domain || null,
    billingSource: store?.billing_source || 'direct',
    storeSynced: Boolean(store?.last_synced_at),
    syncSummary: store?.last_sync_summary || null,
    whatsappConnected: (waCount ?? 0) > 0,
    agentDone: Boolean(profile?.agent_onboarding_done),
    packReady: Boolean(profile?.onboarding_pack),
    plan: profile?.plan || null,
  })
}
