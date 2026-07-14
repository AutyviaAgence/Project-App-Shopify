import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * GET /api/shopify/orphan-stores
 * Boutiques installées mais rattachées à AUCUN compte (`user_id IS NULL`).
 *
 * ⚠️ Pourquoi cette route existe.
 *
 * Avec le managed install, la boutique est provisionnée par token exchange
 * (ensure-store.ts) mais on ne peut pas toujours deviner à QUEL compte Xeyo elle
 * appartient : `resolveXeyoUser()` s'appuie sur `shop.email`, or cet email est une
 * **donnée client protégée** que Shopify ne renvoie qu'aux apps ayant l'approbation
 * *Protected Customer Data*. Tant qu'elle est en attente, `shop_email` est vide et
 * la boutique reste ORPHELINE.
 *
 * On ne peut pas l'attribuer automatiquement (le premier compte à charger son
 * dashboard volerait la boutique d'un autre marchand). On la PROPOSE donc au
 * marchand connecté, qui la relie explicitement via /api/shopify/connect — lequel
 * refuse (409) toute boutique déjà prise.
 *
 * ⚠️ Cette route ne renvoie QUE le domaine, jamais de donnée personnelle : savoir
 * qu'une boutique est en attente de liaison n'apprend rien de sensible.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // L'utilisateur a-t-il déjà une boutique ? Si oui, rien à proposer.
  const { data: own } = await admin
    .from('shopify_stores')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (own) return NextResponse.json({ data: { stores: [] } })

  // ⚠️ NE PROPOSER QUE LES BOUTIQUES DE CET UTILISATEUR — ne jamais retirer ce filtre.
  //
  // Cette route renvoyait TOUTES les boutiques orphelines du système, sans aucun
  // filtre. Combinée à /api/shopify/connect (qui n'exigeait alors aucune preuve de
  // propriété), elle permettait à n'importe quel compte de s'approprier la boutique
  // d'un AUTRE marchand — et d'accéder à ses contacts, ses conversations et son
  // numéro WhatsApp. Vol de données entre marchands.
  //
  // Une boutique n'est proposée que si Shopify nous a donné pour elle un
  // `shop_email` égal à celui du compte. Pour relier une boutique dont l'email
  // diffère, il faut passer par l'admin Shopify (link token) : seule preuve valable
  // qu'on en est bien administrateur.
  if (!user.email) return NextResponse.json({ data: { stores: [] } })

  const { data: orphans } = await admin
    .from('shopify_stores')
    .select('shop_domain, shop_name')
    .is('user_id', null)
    .eq('is_active', true)
    .ilike('shop_email', user.email)
    .limit(5)

  return NextResponse.json({ data: { stores: orphans || [] } })
}
