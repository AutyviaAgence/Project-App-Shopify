import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain } from '@/lib/shopify/client'

/**
 * GET /api/shopify/status?shop=xxx.myshopify.com
 * État de l'intégration pour une boutique : installée, liée à un compte,
 * agent créé, nombre de documents de connaissance.
 * Public (lecture par la page embedded) — ne renvoie aucune donnée sensible.
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop')
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
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
  }

  return NextResponse.json({
    data: {
      installed: true,
      linked: !!store.user_id,
      shop_name: store.shop_name,
      plan: store.plan || 'free',
      subscription_status: store.subscription_status || 'active',
      agent,
      documents,
    },
  })
}
