import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { isValidShopDomain } from '@/lib/shopify/client'
import { autoConfigureAgentFromShop } from '@/lib/shopify/sync'

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

  const { shop } = (await req.json().catch(() => ({}))) as { shop?: string }
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
    .select('id, user_id, is_active, shop_name')
    .eq('shop_domain', shop)
    .single()

  if (!store || !store.is_active) {
    return NextResponse.json({ error: 'Boutique introuvable ou non installée' }, { status: 404 })
  }

  // Si déjà associée à un autre utilisateur, refuser
  if (store.user_id && store.user_id !== user.id) {
    return NextResponse.json({ error: 'Cette boutique est déjà liée à un autre compte' }, { status: 409 })
  }

  // Associer + définir billing_source = direct (le user a un compte Xeyo direct)
  await admin
    .from('shopify_stores')
    .update({ user_id: user.id, billing_source: 'direct', updated_at: new Date().toISOString() })
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
