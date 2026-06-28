import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateTemplates } from '@/lib/templates/generate'
import type { UseCaseKey } from '@/lib/templates/use-cases'

/**
 * POST /api/templates/generate
 * Génère 3 propositions de templates via l'IA, en s'appuyant sur le contexte
 * de la boutique Shopify du marchand (nom, devise, liens).
 *
 * Body : { use_case, objective, tone, variable_keys }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const useCase = body.use_case as UseCaseKey
  const objective = String(body.objective || '').trim()
  const tone = (['professional', 'friendly', 'casual'].includes(body.tone) ? body.tone : 'professional') as 'professional' | 'friendly' | 'casual'
  const variableKeys = Array.isArray(body.variable_keys) ? body.variable_keys.filter((k: unknown) => typeof k === 'string') : []

  if (!useCase || !objective) {
    return NextResponse.json({ error: 'Catégorie et objectif requis' }, { status: 400 })
  }

  // Contexte boutique Shopify (optionnel) → texte injecté au prompt.
  let storeContextPrompt: string | null = null
  let products: { title: string; url: string | null; image_url: string | null; price: string | null }[] = []
  try {
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, store_context')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (store?.store_context) {
      const { buildStoreContextPrompt } = await import('@/lib/shopify/sync')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storeContextPrompt = buildStoreContextPrompt(store.store_context as any)
    }
    // Produits réels (pour liens & carrousels), uniquement ceux avec URL publique.
    if (store?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prods } = await (supabase as any)
        .from('shopify_products')
        .select('title, url, image_url, price')
        .eq('store_id', store.id)
        .not('url', 'is', null)
        .order('position', { ascending: true })
        .limit(12)
      products = prods || []
    }
  } catch { /* contexte boutique facultatif */ }

  try {
    const proposals = await generateTemplates({ useCase, objective, tone, variableKeys, storeContextPrompt, products })
    if (proposals.length === 0) {
      return NextResponse.json({ error: 'Aucune proposition exploitable, reformulez l\'objectif.' }, { status: 422 })
    }
    return NextResponse.json({ data: { proposals } })
  } catch (e) {
    console.error('[templates/generate]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur de génération' }, { status: 500 })
  }
}
