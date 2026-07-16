import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { registerWebhooks, listWebhooks } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'

/**
 * Ré-enregistre les webhooks Shopify pour TOUTES les boutiques déjà connectées.
 *
 * À appeler après l'ajout d'un nouveau topic (ex: RETURNS_REQUEST) : les
 * webhooks ne sont sinon abonnés qu'à l'installation initiale de l'app.
 * `registerWebhooks` réconcilie (crée ce qui manque, redresse les URL erronées).
 *
 *   GET /api/shopify/reregister-webhooks        → réconcilie
 *   GET /api/shopify/reregister-webhooks?dry=1  → DIAGNOSTIC seul, ne modifie rien
 *
 * (Authorization: Bearer CRON_SECRET)
 *
 * Le mode `dry` existe parce qu'un trigger muet a deux causes très différentes —
 * webhook jamais enregistré, ou enregistré vers une mauvaise URL — et qu'on ne
 * peut pas les distinguer sans regarder l'état réel chez Shopify.
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

  // Diagnostic seul : on regarde, on ne touche à rien.
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  type Result = {
    shop: string; ok: boolean; errors: string[]
    before?: { topic: string; callbackUrl: string }[]
    after?: { topic: string; callbackUrl: string }[]
  }
  const results: Result[] = []

  for (const store of stores || []) {
    if (!store.shop_domain || !store.access_token) {
      results.push({ shop: store.shop_domain || '?', ok: false, errors: ['token manquant'] })
      continue
    }
    try {
      // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
      // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit ;
      // si null, on marque cette boutique en échec et on passe à la suivante.
      const token = await getValidAccessToken(store.shop_domain)
      if (!token) {
        results.push({ shop: store.shop_domain, ok: false, errors: ['Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter'] })
        continue
      }

      const before = await listWebhooks(store.shop_domain, token)
      const strip = (ws: { topic: string; callbackUrl: string }[]) =>
        ws.map((w) => ({ topic: w.topic, callbackUrl: w.callbackUrl }))

      if (dryRun) {
        results.push({
          shop: store.shop_domain,
          ok: before.ok,
          errors: before.ok ? [] : [before.error],
          before: strip(before.webhooks),
        })
        continue
      }

      const r = await registerWebhooks(store.shop_domain, token)
      const after = await listWebhooks(store.shop_domain, token)
      results.push({
        shop: store.shop_domain,
        ok: r.ok,
        errors: r.errors,
        before: strip(before.webhooks),
        after: strip(after.webhooks),
      })
    } catch (e) {
      results.push({ shop: store.shop_domain, ok: false, errors: [e instanceof Error ? e.message : 'erreur'] })
    }
  }

  return NextResponse.json({ ok: true, dryRun, count: results.length, results })
}
