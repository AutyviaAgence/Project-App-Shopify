import { NextRequest, NextResponse } from 'next/server'
import { checkTokenLimit } from '@/lib/openai/token-tracker'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { buildStoreContextPrompt } from '@/lib/shopify/sync'
import { PACK_SPECS, PACK_VERSION, isValidBody, type OnboardingPack, type PackItem } from '@/lib/onboarding/pack-spec'

/**
 * POST /api/onboarding/generate-pack
 *
 * Génère le pack d'onboarding : pour CHAQUE trigger d'automatisation (15),
 * un modèle WhatsApp personnalisé au ton de la boutique. PUR : ne persiste
 * RIEN en base métier — le pack est seulement mis en cache sur le profil
 * (profiles.onboarding_pack) pour éviter toute re-génération au retour.
 * La persistance réelle passe par /api/onboarding/apply-pack après
 * VALIDATION explicite du marchand.
 *
 * L'IA ne rédige QUE les textes (body/header/label) : les variables {{n}}
 * et les délais viennent de PACK_SPECS → modèles toujours envoyables.
 *
 * Body : { tone?, objectives?: string[], refresh?: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // ⚠️ QUOTA DE TOKENS — la cle OpenAI est mutualisee entre tous les marchands.
  // Sans ce controle, un seul compte pouvait boucler sur cette route et bruler
  // le budget API. Les routes agents/generate & co le verifiaient deja.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplementaires.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as { tone?: string; objectives?: string[]; refresh?: boolean; locale?: string }
  // Langue du MARCHAND (interface) — ne concerne QUE le NOM de l'automatisation,
  // pas le corps du message (destiné au CLIENT, sa langue à lui).
  const merchantEn = body.locale === 'en'

  // Cache de reprise : pack déjà généré → renvoyé tel quel (pas de re-coût IA).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles').select('onboarding_pack').eq('id', user.id).maybeSingle()
  // Un cache d'une VERSION antérieure (généré avant les boutons/le carrousel)
  // est ignoré et régénéré, sinon les nouveautés n'apparaîtraient jamais.
  if (profile?.onboarding_pack && profile.onboarding_pack.version === PACK_VERSION && !body.refresh) {
    return NextResponse.json({ data: profile.onboarding_pack, cached: true })
  }

  // Boutique requise (le pack est personnalisé à partir de son analyse).
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('shop_name, shop_domain, country, store_context')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'Aucune boutique Shopify connectée.' }, { status: 400 })

  const shopName = store.shop_name || store.shop_domain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeContextPrompt = store.store_context ? buildStoreContextPrompt(store.store_context as any) : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: products } = await (supabase as any)
    .from('shopify_products')
    .select('title, price, url, image_url')
    .eq('user_id', user.id).order('position').limit(12)
  type Prod = { title: string; price: string | null; url: string | null; image_url: string | null }
  const productList = ((products || []) as Prod[]).map((p) => p.title).join(' · ') || '(catalogue non disponible)'

  const toneLine = body.tone === 'professional' ? 'professionnel et sobre'
    : body.tone === 'casual' ? 'décontracté et complice'
    : 'chaleureux et humain'

  const specLines = PACK_SPECS.map((s) => {
    const vars = s.variable_keys.map((k, i) => `{{${i + 1}}}=${k}`).join(', ')
    return `- id "${s.trigger}", ${s.label}. Intention : ${s.intent} Variables imposées : ${vars}.`
  }).join('\n')

  // ⚠️ La consigne de langue est placee EN TETE et repetee : noyee en fin de
  // prompt, elle perdait contre le contexte boutique (storeContextPrompt,
  // produits, intentions) qui est lui redige en francais — le modele suivait
  // alors la langue dominante du prompt plutot que l'instruction.
  const langRule = merchantEn
    ? `LANGUE DE SORTIE : ANGLAIS. Chaque "header" et chaque "body" doit être rédigé
INTÉGRALEMENT EN ANGLAIS, sans un seul mot de français, quelle que soit la langue
du contexte boutique ci-dessous. C'est la contrainte la plus importante.

`
    : ''

  const SYSTEM = `${langRule}Tu rédiges des messages WhatsApp e-commerce pour la boutique « ${shopName} ». Ton : ${toneLine}. Langue : ${merchantEn ? 'ANGLAIS (chaque message intégralement en anglais)' : 'français'}.
Pour CHAQUE id listé, écris un message court (2 à 4 phrases max, ≤ 550 caractères) qui utilise LES variables imposées sous leur forme numérotée {{1}}, {{2}}… (toutes, dans un ordre naturel, n'invente JAMAIS d'autre variable ni de {{n}} non listé). Mentionne la marque quand c'est naturel. Pas de MAJUSCULES criardes, pas de spam, emojis sobres autorisés (0 à 2).
Réponds UNIQUEMENT en JSON : { "items": [ { "id": "<trigger>", "header": "titre court (≤ 40 car.) ou null", "body": "le message avec {{n}}" } ] }, un item par id, tous les ids.`

  const USER = `BOUTIQUE : ${shopName}${store.country ? ` (${store.country})` : ''}
${storeContextPrompt}
PRODUITS (échantillon) : ${productList}

MESSAGES À RÉDIGER :
${specLines}`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2, timeout: 90_000 })
  const started = Date.now()
  let generated: Record<string, { header?: string | null; body?: string }> = {}
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
      temperature: 0.6,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'agent_generate', model: res.model || 'gpt-4o',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
    for (const it of parsed.items || []) {
      if (it?.id && typeof it.body === 'string') generated[it.id] = { header: it.header ?? null, body: it.body }
    }
  } catch {
    generated = {} // fallback intégral sur les corps de secours
  }

  // Assemblage : IA si valide, sinon fallback de la spec (toujours envoyable).
  // Les boutons viennent de la SPEC (jamais de l'IA) ; le jeton {store_url}
  // est résolu ici avec le vrai domaine de la boutique.
  const storeUrl = `https://${store.shop_domain}`
  const items: PackItem[] = PACK_SPECS.map((s) => {
    const g = generated[s.trigger]
    // Corps de secours dans la langue rédigée (l'IA écrit en anglais quand le
    // marchand est en anglais → le fallback doit suivre, sinon message mixte).
    const fallback = merchantEn ? s.fallback_body_en : s.fallback_body
    const body_text = g && isValidBody(g.body || '', s.variable_keys.length) ? g.body!.trim() : fallback
    const header_text = g?.header && g.header.length <= 60 ? g.header.trim() : null
    return {
      trigger: s.trigger,
      templateName: s.templateName,
      // `label` et `automation_name` = NOM de l'automatisation (interface
      // marchand) → suit sa langue. Le corps du message reste, lui, dans la
      // langue du client.
      label: merchantEn ? s.labelEn : s.label,
      category: s.category,
      use_case: s.use_case,
      header_text,
      body_text,
      footer_text: merchantEn ? 'Reply STOP to unsubscribe' : 'Répondez STOP pour vous désinscrire',
      variable_keys: s.variable_keys,
      sample_values: s.sample_values,
      delay_minutes: s.default_delay_minutes,
      automation_name: merchantEn ? s.labelEn : s.label,
      description: s.intent,
      buttons: s.buttons
        ? s.buttons.map((b) => (b.type === 'URL' ? { ...b, url: b.url.replaceAll('{store_url}', storeUrl) } : b))
        : null,
    }
  })

  // ── Carrousel produits : si la boutique a ≥ 3 produits AVEC image, le
  // modèle « Campagne planifiée » devient un vrai carrousel WhatsApp (cartes
  // image + nom · prix + bouton Voir). Les URL d'images Shopify sont acceptées
  // par la soumission Meta (resolveHeaderHandle télécharge puis upload). ──
  const carouselProducts = ((products || []) as Prod[])
    .filter((p) => p.image_url && p.title)
    .slice(0, 4)
  if (carouselProducts.length >= 3) {
    const campaign = items.find((i) => i.trigger === 'scheduled_date')
    if (campaign) {
      campaign.template_type = 'carousel'
      campaign.carousel_cards = carouselProducts.map((p) => ({
        header_type: 'image' as const,
        header_media_url: p.image_url,
        // Body de carte ≤ 160 caractères (règle Meta).
        body_text: `${p.title}${p.price ? ` · ${p.price}` : ''}`.slice(0, 160),
        buttons: [{ type: 'URL' as const, text: merchantEn ? 'View' : 'Voir', url: p.url || storeUrl }],
      }))
      // Règles Meta carrousel : pas de header ni footer sur la bulle principale.
      campaign.header_text = null
      campaign.footer_text = null
      campaign.label = merchantEn ? 'Product carousel campaign' : 'Campagne carrousel produits'
      campaign.description = merchantEn
        ? 'Campaign with a carousel of your products (image, price, View button).'
        : 'Campagne avec carrousel de vos produits (image, prix, bouton Voir).'
    }
  }

  // ⚠️ La langue REELLEMENT redigee — pas 'fr' en dur : apply-pack cree ensuite
  // la variante de l'autre langue via translateTemplateRow, et il partirait de
  // la mauvaise source si on mentait ici.
  const pack: OnboardingPack = { version: PACK_VERSION, generated_at: new Date().toISOString(), language: merchantEn ? 'en' : 'fr', items }

  // Cache serveur (reprise sans re-génération).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('profiles').update({ onboarding_pack: pack }).eq('id', user.id)

  return NextResponse.json({ data: pack })
}
