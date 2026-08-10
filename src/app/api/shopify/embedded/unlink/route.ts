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

  // On lit l'ancien propriétaire AVANT de délier, pour nettoyer son plan fantôme.
  const { data: before } = await admin
    .from('shopify_stores')
    .select('user_id')
    .eq('shop_domain', session.shop)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('shopify_stores')
    .update({ user_id: null, unlinked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('shop_domain', session.shop) // ← la boutique DU TOKEN, jamais une autre
    .eq('is_active', true)
    .select('id')

  if (error) {
    console.error('[embedded/unlink] échec pour', session.shop, ':', error.message)
    return NextResponse.json({ error: 'Déliaison impossible', code: 'unlink_failed' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  }

  // ⚠️ NETTOYER LE PLAN FANTÔME de l'ancien propriétaire : sans boutique, aucun
  // abonnement. Sinon il reste 'pro'/'scale' alors qu'il n'a plus de boutique ni de
  // paiement. Best-effort (ne bloque pas la déliaison).
  // `plan = null` (PAS 'free' : contrainte profiles_plan_check) + subscription_status
  // remis à 'none' : sinon un 'active' résiduel rendrait l'ancien compte payant sans
  // boutique (getUserPlan honore l'octroi manuel actif). On coupe les deux.
  const prevUserId = (before as { user_id?: string | null } | null)?.user_id
  if (prevUserId) {
    const { error: planErr } = await admin
      .from('profiles')
      .update({ plan: null, subscription_status: 'none' })
      .eq('id', prevUserId)
    if (planErr) console.error('[embedded/unlink] reset plan échec (non bloquant):', planErr.message)
  }

  console.log('[embedded/unlink] boutique déliée de son compte Xeyo :', session.shop)
  return NextResponse.json({ data: { unlinked: true } })
}
