import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getAuthedUser } from '@/lib/shopify/embedded-auth'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * GET /api/shopify/embedded/overview
 *
 * Données à afficher DANS l'admin Shopify (app embedded) :
 *  - contacts WhatsApp collectés (opt-ins via popup / checkout / page merci)
 *  - conversations récentes + dernier message
 *  - plan courant, pour proposer un changement sans quitter l'admin
 *
 * Requirements couverts :
 *  · 5.1.5 « Retourner les données clients au marchand dans l'admin Shopify » —
 *    les contacts/conversations collectés via le storefront doivent être visibles
 *    DANS l'admin, pas seulement sur app.xeyo.io.
 *  · 2.2.2 « Expérience embarquée cohérente » — l'app doit être utilisable dans
 *    l'admin, pas se contenter d'y afficher un statut.
 *
 * Auth : session token Shopify (embedded) OU cookie (web). ⚠️ En embedded il n'y a
 * pas de RLS → tous les filtres `user_id` sont explicites ici.
 */
export async function GET(req: NextRequest) {
  const authed = await getAuthedUser(req)
  if (!authed) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Sessions WhatsApp DU MARCHAND : périmètre de toutes les lectures ci-dessous.
  const { data: sessions } = await admin
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', authed.userId)
  const sessionIds = (sessions || []).map((s) => s.id)

  // Plan (source de vérité : la boutique, facturée par Shopify).
  const { data: store } = await admin
    .from('shopify_stores')
    .select('plan, subscription_status, shop_domain')
    .eq('user_id', authed.userId)
    .eq('is_active', true)
    .maybeSingle()

  // Email du compte Xeyo auquel la boutique est reliée. En embedded, l'identité
  // vient de la BOUTIQUE (session token), jamais de la personne : tout le staff
  // Shopify voit les données de ce compte. L'afficher évite l'effet « je vois les
  // données de quelqu'un d'autre sans comprendre pourquoi ».
  // ⚠️ Lu AVANT le retour anticipé ci-dessous : une boutique sans session WhatsApp
  // est justement le cas où le marchand a le plus besoin de savoir à quel compte
  // elle est reliée (et de pouvoir la délier).
  const { data: owner } = await admin
    .from('profiles')
    .select('email')
    .eq('id', authed.userId)
    .maybeSingle()
  const linkedAccountEmail = owner?.email ?? null

  if (sessionIds.length === 0) {
    return NextResponse.json({
      data: {
        linkedAccountEmail,
        // Le plan n'est « payant » que si l'abonnement Shopify est réellement actif.
        // Sinon (charge refusée → 'pending', désinstallation → null, annulation), on
        // affiche `free` : le sélecteur de plan proposera de souscrire, au lieu de
        // laisser croire à un abonnement qui n'a jamais été payé.
        plan: store?.subscription_status === 'active' ? (store.plan || 'free') : 'free',
        subscriptionStatus: store?.subscription_status || null,
        shopDomain: store?.shop_domain || null,
        contactsCount: 0,
        optedInCount: 0,
        conversations: [],
      },
    })
  }

  // Contacts collectés (dont opt-ins).
  const [{ count: contactsCount }, { count: optedInCount }] = await Promise.all([
    admin.from('contacts').select('id', { count: 'exact', head: true }).in('session_id', sessionIds),
    admin.from('contacts').select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds).eq('opt_in_status', 'subscribed'),
  ])

  // Conversations récentes + aperçu du dernier message (déchiffré).
  const { data: convs } = await admin
    .from('conversations')
    .select('id, last_message_at, last_message_preview, unread_count, contact:contacts(name, phone_number, opt_in_status)')
    .in('session_id', sessionIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(10)

  type ConvRow = {
    id: string
    last_message_at: string | null
    last_message_preview: string | null
    unread_count: number | null
    contact: { name: string | null; phone_number: string | null; opt_in_status: string | null } | null
  }

  const conversations = ((convs || []) as unknown as ConvRow[]).map((c) => {
    let preview = c.last_message_preview || ''
    // last_message_preview peut être chiffré selon le chemin d'écriture.
    if (preview && preview.length > 40 && !/\s/.test(preview)) {
      try { preview = decryptMessage(preview) } catch { /* garde la valeur brute */ }
    }
    return {
      id: c.id,
      name: c.contact?.name || c.contact?.phone_number || 'Contact',
      phone: c.contact?.phone_number || null,
      optedIn: c.contact?.opt_in_status === 'subscribed',
      lastMessageAt: c.last_message_at,
      preview: preview.slice(0, 90),
      unread: c.unread_count || 0,
    }
  })

  return NextResponse.json({
    data: {
      linkedAccountEmail,
      // Le plan n'est « payant » que si l'abonnement Shopify est réellement actif.
      // Sinon (charge refusée → 'pending', désinstallation → null, annulation), on
      // affiche `free` : le sélecteur de plan proposera de souscrire, au lieu de
      // laisser croire à un abonnement qui n'a jamais été payé.
      plan: store?.subscription_status === 'active' ? (store.plan || 'free') : 'free',
      subscriptionStatus: store?.subscription_status || null,
      shopDomain: store?.shop_domain || null,
      contactsCount: contactsCount ?? 0,
      optedInCount: optedInCount ?? 0,
      conversations,
    },
  })
}
