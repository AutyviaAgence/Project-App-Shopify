import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { registerWebhooks } from '@/lib/shopify/client'
import { getValidAccessToken } from '@/lib/shopify/token'

/**
 * POST /api/shopify/resync-webhooks
 * Ré-enregistre les webhooks Shopify pour la boutique de l'utilisateur connecté.
 *
 * Nécessaire après l'ajout de nouveaux topics (les webhooks ne sont enregistrés
 * qu'à l'installation). Évite de devoir réinstaller l'app.
 * Shopify ignore les doublons (un même topic+URL n'est pas créé deux fois).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: store } = await admin
    .from('shopify_stores')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!store?.access_token) {
    return NextResponse.json({ error: 'Aucune boutique Shopify liée.' }, { status: 404 })
  }

  // Les jetons Shopify EXPIRENT : lire `access_token` en base donnerait tôt ou
  // tard un jeton périmé et un 403 silencieux. getValidAccessToken le rafraîchit.
  const token = await getValidAccessToken(store.shop_domain)
  if (!token) {
    return NextResponse.json(
      { error: 'Jeton Shopify invalide — rouvrez l\'application depuis l\'admin Shopify pour la reconnecter' },
      { status: 502 }
    )
  }
  const result = await registerWebhooks(store.shop_domain, token)

  // Note : registerWebhooks renvoie des "errors" qui incluent les doublons
  // (topic déjà existant) — non bloquants.
  return NextResponse.json({ ok: true, shop: store.shop_domain, errors: result.errors })
}
