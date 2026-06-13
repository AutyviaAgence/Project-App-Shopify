import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { registerWebhooks } from '@/lib/shopify/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * Ré-enregistre les webhooks Shopify pour TOUTES les boutiques déjà connectées.
 *
 * À appeler une fois après l'ajout d'un nouveau topic (ex: RETURNS_REQUEST) :
 * les webhooks ne sont sinon abonnés qu'à l'installation initiale de l'app.
 * `registerWebhooks` est idempotent (ignore les abonnements déjà présents).
 *
 *   GET /api/shopify/reregister-webhooks  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: stores } = await admin
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('is_active', true)

  const results: { shop: string; ok: boolean; errors: string[] }[] = []
  for (const store of stores || []) {
    if (!store.shop_domain || !store.access_token) {
      results.push({ shop: store.shop_domain || '?', ok: false, errors: ['token manquant'] })
      continue
    }
    try {
      const token = decryptMessage(store.access_token)
      const r = await registerWebhooks(store.shop_domain, token)
      results.push({ shop: store.shop_domain, ok: r.ok, errors: r.errors })
    } catch (e) {
      results.push({ shop: store.shop_domain, ok: false, errors: [e instanceof Error ? e.message : 'erreur'] })
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results })
}
