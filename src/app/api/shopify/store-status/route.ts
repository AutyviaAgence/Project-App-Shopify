import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/shopify/store-status
 * Statut de connexion Shopify pour l'utilisateur connecté (carte Dashboard).
 * Lit la boutique active de l'utilisateur et renvoie le résumé de synchro.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_name, shop_domain, last_synced_at, last_sync_summary, store_context')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  // ── Adoption d'une boutique ORPHELINE (user_id NULL) ────────────────────────
  //
  // Le managed install provisionne la boutique par token exchange, mais ne peut
  // pas toujours la rattacher à un compte : resolveXeyoUser() a besoin du
  // `shop_email`, et si l'email de la boutique ne correspond à aucun compte Xeyo
  // (ou si fetchShopInfo a échoué), la boutique reste sans propriétaire. Le
  // marchand voyait alors « Connectez votre boutique » alors qu'elle était bien
  // installée, et l'app embedded affichait 0 contact / 0 agent.
  //
  // ⚠️ SÉCURITÉ — DEUX conditions cumulatives, ne JAMAIS en retirer une :
  //   1. la boutique n'appartient à PERSONNE (`user_id is null`) ;
  //   2. son `shop_email` est CELUI DE L'UTILISATEUR.
  //
  // Sans la condition (2), le premier compte à charger son dashboard adopterait
  // la boutique d'un AUTRE marchand — vol de boutique inter-comptes. La preuve de
  // propriété, c'est l'email que Shopify nous a donné pour cette boutique.
  if (!store && user.email) {
    const { data: orphan } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, last_synced_at, last_sync_summary, store_context')
      .is('user_id', null)
      .eq('is_active', true)
      .ilike('shop_email', user.email)
      .maybeSingle()

    if (orphan) {
      const { error: linkErr } = await supabase
        .from('shopify_stores')
        .update({ user_id: user.id, billing_source: 'shopify', updated_at: new Date().toISOString() })
        .eq('id', orphan.id)
        .is('user_id', null) // re-vérifié à l'écriture : pas de course entre deux comptes.
      if (!linkErr) {
        console.log('[store-status] boutique orpheline adoptée :', orphan.shop_domain, '→', user.id)
        store = orphan
      }
    }
  }

  if (!store) return NextResponse.json({ data: { connected: false } })

  const summary = (store.last_sync_summary || {}) as { products?: number; pages?: boolean; policies?: boolean }
  // store_context : { name, currency, country, links: { label, url }[] }
  const ctx = (store.store_context || {}) as {
    name?: string
    currency?: string | null
    country?: string | null
    links?: { label: string; url: string }[]
  }
  return NextResponse.json({
    data: {
      connected: true,
      shop_name: store.shop_name,
      shop_domain: store.shop_domain,
      last_synced_at: store.last_synced_at,
      products_synced: typeof summary.products === 'number' ? summary.products : null,
      has_pages: !!summary.pages,
      has_policies: !!summary.policies,
      context: {
        name: ctx.name || store.shop_name,
        currency: ctx.currency || null,
        country: ctx.country || null,
        links: Array.isArray(ctx.links) ? ctx.links : [],
      },
    },
  })
}
