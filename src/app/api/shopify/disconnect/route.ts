import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * POST /api/shopify/disconnect
 * Délie la boutique Shopify du compte de l'utilisateur (ex : il veut la rattacher
 * à un autre compte Xeyo).
 *
 * ⚠️ ON NE SUPPRIME PAS LA LIGNE — et c'est essentiel.
 *
 * Avec le managed install, `ensureStoreProvisioned` recrée la boutique dès qu'elle
 * manque : il suffit que le marchand rouvre l'app dans l'admin Shopify (ou même que
 * le dashboard appelle /api/shopify/status) pour qu'un token exchange la ressuscite.
 * Un DELETE était donc annulé dans la seconde — le bouton « déconnecter » semblait
 * ne rien faire.
 *
 * On remet donc `user_id` à NULL : la boutique reste installée côté Shopify (ce qui
 * est la vérité), mais n'appartient plus à ce compte. Elle devient « orpheline » et
 * pourra être reliée à un autre compte (bouton « Relier à mon compte »).
 *
 * On supprime en revanche les 3 documents RAG générés depuis cette boutique
 * (catalogue / pages / politiques) : sans ça, l'agent continuerait de répondre avec
 * l'ancien catalogue.
 *
 * On NE touche PAS : l'agent IA, les documents ajoutés à la main par le marchand
 * (PDF/textes), les templates et les automatisations.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, catalog_doc_id, pages_doc_id, policies_doc_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Aucune boutique connectée' }, { status: 404 })

  // Supprimer les 3 documents Shopify (par leurs IDs). Le CASCADE supprime les
  // chunks et les liens agent_knowledge_documents associés.
  const docIds = [store.catalog_doc_id, store.pages_doc_id, store.policies_doc_id].filter(Boolean) as string[]
  if (docIds.length > 0) {
    await supabase.from('knowledge_documents').delete().eq('user_id', user.id).in('id', docIds)
  }

  // Délier : `user_id` → NULL. Surtout PAS de DELETE (cf. en-tête : le managed
  // install recréerait la ligne aussitôt et la déconnexion serait sans effet).
  // On efface aussi les doc-ids : ils pointent vers des documents qu'on vient de
  // supprimer, et une nouvelle liaison doit repartir d'une synchro propre.
  //
  // ⚠️ ÉCRITURE EN SERVICE ROLE, et c'est nécessaire. La RLS de `shopify_stores`
  // n'autorise à modifier que SES propres lignes (`user_id = auth.uid()`) — or on
  // met justement `user_id` à NULL, ce qui produit une ligne qui n'appartient plus
  // à personne. Postgres refusait donc l'UPDATE :
  //   « new row violates row-level security policy for table shopify_stores »
  // (Le DELETE d'avant passait, lui, d'où le bug qui n'apparaissait qu'ici.)
  //
  // La preuve de propriété est faite AU-DESSUS : le SELECT filtre sur
  // `user_id = user.id`. On ne délie donc que la boutique de l'appelant.
  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await admin
    .from('shopify_stores')
    .update({
      user_id: null,
      // Marque la déliaison comme VOLONTAIRE. Sans ça, store-status ré-adopterait
      // la boutique au chargement suivant (son shop_email correspond à l'email du
      // compte) et la déconnexion serait annulée dans la seconde.
      unlinked_at: new Date().toISOString(),
      catalog_doc_id: null,
      pages_doc_id: null,
      policies_doc_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id)
    .eq('user_id', user.id) // ← ceinture et bretelles : jamais la boutique d'un autre

  if (error) {
    console.error('[shopify/disconnect] échec :', error.message)
    return NextResponse.json({ error: 'Déconnexion impossible' }, { status: 500 })
  }

  return NextResponse.json({ data: { disconnected: true, documents_removed: docIds.length } })
}
