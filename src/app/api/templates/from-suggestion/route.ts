import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateTemplates } from '@/lib/templates/generate'
import { submitTemplateRow } from '@/lib/templates/submit'
import { buildStoreContextPrompt } from '@/lib/shopify/sync'
import { canUseAiOrOnboarding } from '@/lib/plans/gate'
import { USE_CASE_BY_KEY, type UseCaseKey } from '@/lib/templates/use-cases'
import { VARIABLE_BY_KEY } from '@/lib/templates/variables'

/**
 * POST /api/templates/from-suggestion
 *   { purpose, suggestion, useCase?, submit?: boolean }
 *
 * Transforme une SUGGESTION de l'assistant de parcours en modèle réel.
 *
 * ── POURQUOI CETTE ROUTE ────────────────────────────────────────────────────
 *
 * Quand l'assistant d'automatisation manque un message, il décrit précisément
 * celui à créer (« relance J+1 avec code promo, bouton Finaliser »). Mais cette
 * suggestion n'était QUE du texte affiché : le marchand devait aller dans
 * Modèles et tout recopier à la main. Le conseil de l'IA se perdait en route.
 *
 * Ici on la rend exploitable : on génère le modèle À PARTIR de la suggestion, on
 * l'enregistre en brouillon, et — si demandé — on le soumet à Meta dans la
 * foulée.
 *
 * On réutilise `generateTemplates`, jamais un chemin parallèle : c'est lui qui
 * porte les règles Meta (rien de promotionnel en UTILITY, pas d'URL d'exemple
 * dans les boutons, variables non collées aux bords…). Un second générateur
 * dériverait de ces règles sans qu'on s'en aperçoive.
 *
 * Sortie : { template: { id, name, body_text, … }, submitted?: {...} }
 */

/** Nom Meta : minuscules, chiffres et underscores uniquement. */
function toTemplateName(purpose: string): string {
  const base = purpose
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'message'
  // Suffixe court : deux modèles issus de suggestions proches ne doivent pas
  // entrer en collision (le nom est unique chez Meta, par compte).
  return `${base}_${Date.now().toString(36).slice(-4)}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAiOrOnboarding(user.id)
  if (!gate.allowed) {
    return NextResponse.json({ error: 'La création de modèles par l’IA nécessite un plan payant.', upgrade: true }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    purpose?: string
    suggestion?: string
    useCase?: string
    submit?: boolean
  }
  const purpose = (body.purpose || '').trim()
  const suggestion = (body.suggestion || '').trim()
  if (!purpose) return NextResponse.json({ error: 'purpose requis' }, { status: 400 })

  // La famille décide de ce que Meta accepte : sans use_case valide, on retombe
  // sur le TRANSACTIONNEL, le défaut sûr (il n'autorise rien de promotionnel,
  // donc rien qui puisse faire refuser le modèle par erreur).
  const useCase: UseCaseKey = (body.useCase && USE_CASE_BY_KEY[body.useCase as UseCaseKey])
    ? (body.useCase as UseCaseKey)
    : 'order_status'

  // Session WhatsApp : un modèle appartient à une WABA.
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!session?.id) {
    return NextResponse.json({ error: 'Connectez d’abord WhatsApp pour créer un modèle.' }, { status: 400 })
  }

  // Contexte boutique + produits réels (mêmes sources que /generate : les liens
  // des boutons doivent pointer vers de VRAIS produits).
  const { data: store } = await supabase
    .from('shopify_stores').select('store_context').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeContextPrompt = store?.store_context ? buildStoreContextPrompt(store.store_context as any) : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = await (supabase as any)
    .from('shopify_products').select('title, price, url, image_url').eq('user_id', user.id).limit(12)

  // Variables : celles du cas d'usage. L'assistant de parcours décrit l'INTENTION
  // du message, pas ses variables — on les déduit comme le fait /converse.
  const varsByUseCase: Record<string, string[]> = {
    order_status: ['customer_first_name', 'order_number', 'order_status_url'],
    cart: ['customer_first_name', 'cart_url'],
    marketing: ['customer_first_name'],
    support: ['customer_first_name'],
    billing: ['customer_first_name', 'order_number'],
  }
  const variableKeys = (varsByUseCase[useCase] || ['customer_first_name']).filter((k) => !!VARIABLE_BY_KEY[k])

  // L'objectif reprend la suggestion de l'assistant : c'est elle qui porte
  // l'angle et l'incitation qu'il avait pensés pour ce parcours.
  const objective = suggestion ? `${purpose}\n\nConsignes : ${suggestion}` : purpose

  let proposals
  try {
    proposals = await generateTemplates({
      useCase, objective, tone: 'friendly',
      variableKeys, storeContextPrompt, products: products || [],
    })
  } catch (e) {
    console.error('[templates/from-suggestion] génération:', e)
    return NextResponse.json({ error: 'La génération a échoué. Réessayez.' }, { status: 502 })
  }
  const best = proposals?.[0]
  if (!best?.body_text) {
    return NextResponse.json({ error: 'Aucun message exploitable n’a pu être généré.' }, { status: 502 })
  }

  // Échantillons Meta : une valeur par variable, dans l'ordre du corps.
  const sampleValues = (best.variable_keys || []).map((k) => VARIABLE_BY_KEY[k]?.sample || 'exemple')

  const name = toTemplateName(purpose)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: insErr } = await (supabase as any)
    .from('whatsapp_templates')
    .insert({
      user_id: user.id,
      session_id: session.id,
      name,
      language: 'fr',
      category: USE_CASE_BY_KEY[useCase]?.metaCategory || 'UTILITY',
      use_case: useCase,
      body_text: best.body_text,
      sample_values: sampleValues,
      variable_keys: best.variable_keys || [],
      buttons: best.buttons || [],
      template_type: best.template_type || 'standard',
      ...(best.template_type === 'carousel' ? { carousel_cards: best.cards || [] } : {}),
      ...(best.template_type === 'limited_time_offer'
        ? { lto_title: best.lto_title, lto_default_hours: best.lto_hours }
        : {}),
      status: 'draft',
    })
    .select()
    .single()

  if (insErr || !created) {
    console.error('[templates/from-suggestion] insert:', insErr?.message)
    return NextResponse.json({ error: insErr?.message || 'Création impossible' }, { status: 500 })
  }

  // Soumission Meta immédiate si demandée. Un échec ici n'annule PAS la
  // création : le brouillon reste, le marchand pourra le corriger et le
  // resoumettre — perdre le message généré serait le pire des deux mondes.
  let submitted: { ok: boolean; error?: string } | undefined
  if (body.submit) {
    try {
      const sr = await submitTemplateRow(supabase, user.id, created.id)
      submitted = { ok: sr.ok, error: sr.ok ? undefined : sr.error }
    } catch (e) {
      submitted = { ok: false, error: e instanceof Error ? e.message : 'erreur' }
    }
  }

  return NextResponse.json({ template: created, submitted })
}
