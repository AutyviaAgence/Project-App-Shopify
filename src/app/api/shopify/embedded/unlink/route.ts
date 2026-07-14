import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { sessionFromRequest } from '@/lib/shopify/session-token'

/**
 * POST /api/shopify/embedded/unlink
 *
 * Délie la boutique de son compte Xeyo actuel, depuis l'admin Shopify.
 *
 * ⚠️ POURQUOI CETTE ROUTE EXISTE.
 *
 * En embedded, l'identité vient du session token, qui désigne la BOUTIQUE — jamais
 * une personne. `resolveXeyoUser()` renvoie donc le compte Xeyo **propriétaire de
 * la boutique**, quel que soit le membre du staff Shopify qui ouvre l'app. C'est le
 * modèle voulu (l'app appartient à la boutique, comme chez Gorgias ou Klaviyo) —
 * mais un marchand qui voulait rattacher sa boutique à un AUTRE compte Xeyo n'avait
 * aucun moyen de le faire : l'app affichait silencieusement les données du premier
 * compte lié, sans rien expliquer.
 *
 * `/api/shopify/disconnect` ne pouvait pas servir : il exige un cookie Supabase,
 * absent de l'iframe.
 *
 * ⚠️ SÉCURITÉ : on ne délie QUE la boutique portée par le session token (vérifié
 * HMAC contre SHOPIFY_API_SECRET). Impossible de délier la boutique d'un autre
 * marchand : le token ne mentira pas sur son `dest`.
 *
 * Qui peut l'appeler : tout staff ayant accès à l'admin Shopify de cette boutique.
 * C'est cohérent — ces mêmes personnes peuvent déjà désinstaller l'app.
 *
 * On ne supprime PAS la ligne : on remet `user_id` à NULL. La boutique redevient
 * « orpheline » et pourra être reliée à un autre compte Xeyo (bouton « Relier à mon
 * compte » du dashboard). Les contacts et conversations restent attachés au compte
 * précédent — les effacer ici détruirait les données d'un marchand qui n'a rien
 * demandé.
 */
export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('shopify_stores')
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq('shop_domain', session.shop) // ← la boutique DU TOKEN, jamais une autre
    .eq('is_active', true)
    .select('id')

  if (error) {
    console.error('[embedded/unlink] échec pour', session.shop, ':', error.message)
    return NextResponse.json({ error: 'Déliaison impossible' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  }

  console.log('[embedded/unlink] boutique déliée de son compte Xeyo :', session.shop)
  return NextResponse.json({ data: { unlinked: true } })
}
