import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain } from '@/lib/shopify/client'
import { autoConfigureAgentFromShop } from '@/lib/shopify/sync'
import { verifyLinkToken } from '@/lib/shopify/link-token'

/**
 * POST /api/shopify/connect  { shop }
 * Associe une boutique (déjà autorisée via OAuth) à l'utilisateur connecté,
 * puis déclenche l'auto-configuration de l'agent (pull boutique → KB → agent).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { shop, linkToken } = (await req.json().catch(() => ({}))) as { shop?: string; linkToken?: string }
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Paramètre shop invalide' }, { status: 400 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // La boutique doit exister (installée via OAuth) et être active
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, user_id, is_active, shop_name, shop_email')
    .eq('shop_domain', shop)
    .single()

  if (!store || !store.is_active) {
    return NextResponse.json({ error: 'Boutique introuvable ou non installée' }, { status: 404 })
  }

  // Si déjà associée à un autre utilisateur, refuser
  if (store.user_id && store.user_id !== user.id) {
    return NextResponse.json({ error: 'Cette boutique est déjà liée à un autre compte' }, { status: 409 })
  }

  // ⚠️ PREUVE DE PROPRIÉTÉ — OBLIGATOIRE, NE JAMAIS RETIRER.
  //
  // Cette route n'exigeait AUCUNE preuve : n'importe quel compte Xeyo connecté
  // pouvait réclamer n'importe quelle boutique ORPHELINE (`user_id IS NULL`) — et
  // toute boutique l'est entre son installation et sa liaison. Un attaquant qui
  // listait /api/shopify/orphan-stores (qui les renvoyait TOUTES, sans filtre)
  // pouvait donc s'approprier la boutique d'un autre marchand, et lire ses
  // contacts, ses conversations et son numéro WhatsApp. Vol de données entre
  // marchands.
  //
  // Deux preuves acceptées, et rien d'autre :
  //   · un LINK TOKEN signé, délivré uniquement dans l'admin Shopify de CETTE
  //     boutique (donc à quelqu'un qui en est déjà administrateur) ;
  //   · à défaut, l'email du compte == `shop_email` (l'email que Shopify nous a
  //     donné pour cette boutique).
  const linkedShop = verifyLinkToken(linkToken)
  const emailMatches =
    !!store.shop_email &&
    !!user.email &&
    store.shop_email.trim().toLowerCase() === user.email.trim().toLowerCase()

  if (linkedShop !== shop && !emailMatches) {
    return NextResponse.json(
      {
        error:
          'Impossible de vérifier que cette boutique vous appartient. ' +
          'Ouvrez Xeyo depuis l’admin Shopify de la boutique pour la relier.',
      },
      { status: 403 }
    )
  }

  // Associer la boutique au compte. ⚠️ CONFORMITÉ : une boutique Shopify est
  // TOUJOURS facturée via la Billing API de Shopify (App Store requirement §1.2 :
  // le billing hors plateforme interdit les apps de l'App Store). On posait
  // `direct` (= Stripe) → motif de rejet / suspension d'app.
  await admin
    .from('shopify_stores')
    .update({ user_id: user.id, billing_source: 'shopify', unlinked_at: null, updated_at: new Date().toISOString() })
    .eq('id', store.id)

  // Re-slugger les liens du user au nom de la boutique (si slug encore aléatoire).
  // Un slug est "aléatoire" s'il ne contient pas de tiret OU ressemble à du base64url.
  if (store.shop_name) {
    try {
      const { slugify, generateUniqueSlug } = await import('@/lib/links/slug')
      const target = slugify(store.shop_name)
      const { data: links } = await admin
        .from('wa_links')
        .select('id, slug')
        .eq('user_id', user.id)
      for (const l of links || []) {
        const looksRandom = !l.slug || !/[a-z]+-[a-z]/.test(l.slug)
        if (looksRandom && target) {
          // garantir l'unicité au cas où
          const unique = await generateUniqueSlug(admin, store.shop_name)
          await admin.from('wa_links').update({ slug: unique, name: `Lien ${store.shop_name}` }).eq('id', l.id)
        }
      }
    } catch (e) {
      console.error('[shopify/connect] reslug échec:', e)
    }
  }

  // Auto-configuration de l'agent (peut prendre quelques secondes)
  const result = await autoConfigureAgentFromShop(store.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, linked: true }, { status: 207 })
  }

  return NextResponse.json({
    data: { linked: true, agentId: result.agentId, documents: result.documents },
  })
}
