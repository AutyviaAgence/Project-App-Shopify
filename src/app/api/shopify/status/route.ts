import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain } from '@/lib/shopify/client'
import { getUserPlan } from '@/lib/shopify/plans'

/**
 * GET /api/shopify/status
 * État de l'intégration d'une boutique (installée, agent, WhatsApp, modèles…).
 *
 * ⚠️ SÉCURITÉ : cette route était PUBLIQUE et prenait le `?shop=` de l'URL — elle
 * divulguait donc l'état d'un compte (plan, nom de l'agent, WhatsApp connecté…) à
 * quiconque connaissait un domaine de boutique. Elle exige désormais un SESSION
 * TOKEN Shopify (App Bridge) et dérive la boutique du token, jamais de l'URL.
 * Le cookie Supabase reste accepté (dashboard web) via getAuthedUser.
 */
export async function GET(req: NextRequest) {
  const { sessionFromRequest } = await import('@/lib/shopify/session-token')
  const session = sessionFromRequest(req)

  let shop: string | null = session?.shop ?? null
  if (!shop) {
    // Hors embedded (dashboard web) : on autorise via le cookie, et on ne sert que
    // la boutique DE L'UTILISATEUR — pas un domaine arbitraire.
    const { createClient } = await import('@/lib/supabase/server')
    const supa = await createClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const adminEarly = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: own } = await adminEarly
      .from('shopify_stores').select('shop_domain')
      .eq('user_id', user.id).eq('is_active', true).maybeSingle()
    shop = own?.shop_domain ?? null
    if (!shop) return NextResponse.json({ data: { installed: false } })
  }
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Boutique invalide' }, { status: 400 })
  }

  // ⚠️ MANAGED INSTALL : Shopify installe l'app sans jamais appeler notre callback
  // OAuth — la ligne `shopify_stores` n'existe donc pas, et cette route renvoyait
  // `installed: false` à l'infini (« Installation requise » dans l'admin Shopify).
  // C'est CETTE route que la page embedded interroge en premier : on provisionne
  // donc ici, par token exchange. No-op si la boutique existe déjà.
  if (session) {
    const rawToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { ensureStoreProvisioned } = await import('@/lib/shopify/ensure-store')
    await ensureStoreProvisioned(shop, rawToken)
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, user_id, shop_name, is_active, plan, subscription_status')
    .eq('shop_domain', shop)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ data: { installed: false } })
  }

  let agent: { id: string; name: string } | null = null
  let documents = 0
  let whatsappConnected = false
  let approvedTemplates = 0

  // Plan effectif : DÉLÉGUÉ à getUserPlan(), seule source de vérité.
  //
  // Cette route recalculait le plan à la main et écrasait avec `profiles.plan` —
  // sans jamais regarder `subscription_status`. Un marchand qui refusait la charge
  // Shopify (statut 'pending') se voyait donc renvoyer un plan payant. getUserPlan
  // arbitre shopify_stores vs profiles ET exige un abonnement `active`.
  let effectivePlan: string = 'free'
  if (store.user_id) {
    effectivePlan = (await getUserPlan(store.user_id)).id
    // Un admin garde l'accès complet (comptes internes, démos).
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', store.user_id)
      .maybeSingle()
    if (profile?.role === 'admin') effectivePlan = 'scale'
  }
  if (store.user_id) {
    const { data: agents } = await admin
      .from('ai_agents')
      .select('id, name')
      .eq('user_id', store.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
    agent = agents?.[0] ?? null

    const { count } = await admin
      .from('knowledge_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', store.user_id)
    documents = count ?? 0

    // WhatsApp connecté ?
    const { count: waCount } = await admin
      .from('whatsapp_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', store.user_id)
      .eq('status', 'connected')
    whatsappConnected = (waCount ?? 0) > 0

    // Modèles approuvés ?
    const { count: tplCount } = await admin
      .from('whatsapp_templates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', store.user_id)
      .eq('status', 'approved')
    approvedTemplates = tplCount ?? 0
  }

  return NextResponse.json({
    data: {
      installed: true,
      linked: !!store.user_id,
      shop_name: store.shop_name,
      plan: effectivePlan,
      subscription_status: store.subscription_status || 'active',
      agent,
      documents,
      whatsapp_connected: whatsappConnected,
      approved_templates: approvedTemplates,
    },
  })
}
