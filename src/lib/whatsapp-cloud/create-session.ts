import { generateUniqueSlug } from '@/lib/links/slug'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { encryptMessage } from '@/lib/crypto/encryption'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Crée la session WhatsApp (WABA) d'un utilisateur à partir des 3 identifiants
 * Meta, puis enchaîne les effets de bord « best effort » (import des modèles
 * déjà présents chez Meta, création du lien WhatsApp).
 *
 * Partagé entre les deux chemins de connexion :
 *   - saisie manuelle des 3 champs      → POST /api/sessions
 *   - Embedded Signup (popup Facebook)  → POST /api/whatsapp/embedded-signup
 * Le quota de plan est vérifié par l'appelant (il diffère selon le chemin).
 */
export async function createWabaSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  creds: {
    waba_phone_number_id: string
    waba_business_account_id: string
    waba_access_token: string
  }
): Promise<
  | { ok: true; session: Record<string, unknown>; importedTemplates: number; webhooksSubscribed: boolean }
  | { ok: false; error: string }
> {
  const instanceName = `waba-${userId.slice(0, 8)}-${Date.now()}`

  // Vérifier le token en récupérant le numéro (valide aussi les identifiants).
  const phoneResult = await wabaClient.getPhoneNumber(
    creds.waba_phone_number_id,
    creds.waba_access_token
  )
  const displayPhone = phoneResult.ok ? phoneResult.data.display_phone_number : null

  // Abonner NOTRE app à la WABA. SANS CET APPEL, Meta n'envoie AUCUN webhook
  // pour ce compte : ni messages entrants, ni statuts, ni qualité du numéro.
  // C'était fait uniquement par l'Embedded Signup ; les sessions créées par
  // saisie manuelle ne recevaient donc jamais de message. Best effort : la
  // session reste utilisable pour l'ENVOI même si l'abonnement échoue.
  let webhooksSubscribed = false
  try {
    const sub = await fetch(
      `https://graph.facebook.com/v22.0/${creds.waba_business_account_id}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${creds.waba_access_token}` } }
    )
    webhooksSubscribed = sub.ok
    if (!sub.ok) {
      console.error('[waba] subscribed_apps échec:', JSON.stringify(await sub.json().catch(() => ({}))))
    }
  } catch (e) {
    console.error('[waba] subscribed_apps erreur:', e)
  }

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: userId,
      instance_name: instanceName,
      status: 'connected' as const,
      phone_number: displayPhone?.replace(/\D/g, '') || null,
      integration_type: 'waba',
      waba_phone_number_id: creds.waba_phone_number_id,
      waba_business_account_id: creds.waba_business_account_id,
      waba_access_token: encryptMessage(creds.waba_access_token),
    })
    .select()
    .single()

  if (dbError || !session) {
    return { ok: false, error: dbError?.message ?? 'Création de session impossible' }
  }

  // Import des modèles déjà présents sur ce compte WhatsApp (best effort) : on
  // les récupère depuis Meta pour qu'ils apparaissent immédiatement, avec leur
  // vrai meta_id/statut. Évite le bug du meta_id obsolète au changement de WABA.
  let importedTemplates = 0
  try {
    const { importTemplatesFromMeta } = await import('@/lib/templates/meta-import')
    const r = await importTemplatesFromMeta(supabase, userId, {
      id: session.id,
      waba_business_account_id: session.waba_business_account_id,
      waba_access_token: session.waba_access_token, // version chiffrée : le module déchiffre
    })
    importedTemplates = r.imported
  } catch (e) {
    console.error('[waba] import templates Meta échec (non bloquant):', e)
  }

  // Création auto d'un lien WhatsApp associé à la session (best effort).
  try {
    const { count } = await supabase
      .from('wa_links')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('user_id', userId)

    if (!count) {
      const { data: store } = await supabase
        .from('shopify_stores')
        .select('shop_name')
        .eq('user_id', userId)
        .maybeSingle()
      const slugSource = store?.shop_name || displayPhone || 'boutique'
      const slug = await generateUniqueSlug(supabase, slugSource)

      const { error: linkError } = await supabase.from('wa_links').insert({
        user_id: userId,
        session_id: session.id,
        name: store?.shop_name ? `Lien ${store.shop_name}` : 'Lien WhatsApp',
        slug,
        pre_filled_message: 'Bonjour, je viens de votre boutique !',
        is_active: true,
        ai_agent_id: null,
      })
      if (linkError) console.error('[waba] Échec création auto du lien WA:', linkError.message)
    }
  } catch (e) {
    console.error('[waba] Erreur création auto du lien WA:', e)
  }

  return { ok: true, session, importedTemplates, webhooksSubscribed }
}
