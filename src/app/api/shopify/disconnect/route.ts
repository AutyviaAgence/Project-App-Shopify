import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/shopify/disconnect
 * Délie la boutique Shopify du compte de l'utilisateur (ex : il veut changer de
 * boutique). On supprime :
 *   - le lien Shopify (ligne shopify_stores : token, sync, doc-ids)
 *   - les 3 documents RAG générés depuis CETTE boutique (catalogue / pages /
 *     politiques), pour ne pas que l'agent garde l'ancien catalogue.
 * On NE touche PAS : l'agent IA, ni les documents ajoutés à la main par le
 * marchand (PDF/textes), ni les templates/automatisations.
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

  // Délier la boutique (supprime la ligne : token, sync, etc.).
  await supabase.from('shopify_stores').delete().eq('id', store.id).eq('user_id', user.id)

  return NextResponse.json({ data: { disconnected: true, documents_removed: docIds.length } })
}
