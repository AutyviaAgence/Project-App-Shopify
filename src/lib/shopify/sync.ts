import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { shopifyGraphQL } from './client'
import { decryptMessage } from '@/lib/crypto/encryption'
import { processDocument } from '@/lib/knowledge/processor'

/**
 * Auto-configuration de l'agent à partir d'une boutique Shopify (S2).
 *
 * Pull (lecture seule, via Admin API) :
 *   - catalogue produits (nom, description, prix, variantes)
 *   - pages (FAQ, livraison…)
 *   - politiques natives (CGV, retours, confidentialité, livraison)
 * → transforme en documents de connaissance (RAG) rattachés à l'agent
 * → crée l'agent automatiquement
 *
 * Côté serveur (service_role), pas de contexte auth utilisateur.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Requêtes GraphQL ───────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          title
          description
          productType
          vendor
          tags
          variants(first: 20) {
            edges { node { title price sku availableForSale } }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }`

const PAGES_QUERY = `
  query Pages($cursor: String) {
    pages(first: 50, after: $cursor) {
      edges { cursor node { title body } }
      pageInfo { hasNextPage }
    }
  }`

const SHOP_POLICIES_QUERY = `
  {
    shop {
      name
      shopPolicies { title body }
    }
  }`

// ─── Pull + formatage en texte ──────────────────────────────────────

type ProductNode = {
  title: string; description: string; productType: string; vendor: string; tags: string[]
  variants: { edges: { node: { title: string; price: string; sku: string; availableForSale: boolean } }[] }
}

type ProductsResp = { products: { edges: { cursor: string; node: ProductNode }[]; pageInfo: { hasNextPage: boolean } } }

type ProductEdge = { cursor: string; node: ProductNode }
type VariantEdge = { node: { title: string; price: string; sku: string; availableForSale: boolean } }

async function fetchAllProducts(shop: string, token: string): Promise<string> {
  const lines: string[] = ['# Catalogue produits', '']
  let cursor: string | null = null
  let pages = 0
  while (pages < 20) {
    const res = await shopifyGraphQL<ProductsResp>(shop, token, PRODUCTS_QUERY, { cursor })
    if (!res.ok) break
    const edges: ProductEdge[] = res.data.products.edges
    for (const { node: p } of edges) {
      lines.push(`## ${p.title}`)
      if (p.productType) lines.push(`Type : ${p.productType}`)
      if (p.vendor) lines.push(`Marque : ${p.vendor}`)
      if (p.description) lines.push(p.description.replace(/<[^>]+>/g, ' ').trim())
      const variants = p.variants.edges.map((v: VariantEdge) => `${v.node.title} — ${v.node.price}${v.node.availableForSale ? '' : ' (rupture)'}`)
      if (variants.length) lines.push(`Variantes : ${variants.join(' · ')}`)
      lines.push('')
    }
    if (!res.data.products.pageInfo.hasNextPage) break
    cursor = edges.length ? edges[edges.length - 1].cursor : null
    if (!cursor) break
    pages++
  }
  return lines.join('\n')
}

type PageEdge = { cursor: string; node: { title: string; body: string } }
type PagesResp = { pages: { edges: PageEdge[]; pageInfo: { hasNextPage: boolean } } }

async function fetchAllPages(shop: string, token: string): Promise<string> {
  const lines: string[] = ['# Pages de la boutique', '']
  let cursor: string | null = null
  let pages = 0
  while (pages < 10) {
    const res = await shopifyGraphQL<PagesResp>(shop, token, PAGES_QUERY, { cursor })
    if (!res.ok) break
    const edges: PageEdge[] = res.data.pages.edges
    for (const { node } of edges) {
      lines.push(`## ${node.title}`)
      if (node.body) lines.push(node.body.replace(/<[^>]+>/g, ' ').trim())
      lines.push('')
    }
    if (!res.data.pages.pageInfo.hasNextPage) break
    cursor = edges.length ? edges[edges.length - 1].cursor : null
    if (!cursor) break
    pages++
  }
  return lines.join('\n')
}

async function fetchPolicies(shop: string, token: string): Promise<string> {
  const res = await shopifyGraphQL<{ shop: { name: string; shopPolicies: { title: string; body: string }[] } }>(
    shop, token, SHOP_POLICIES_QUERY
  )
  if (!res.ok) return ''
  const lines: string[] = ['# Politiques de la boutique', '']
  for (const pol of res.data.shop.shopPolicies || []) {
    lines.push(`## ${pol.title}`)
    if (pol.body) lines.push(pol.body.replace(/<[^>]+>/g, ' ').trim())
    lines.push('')
  }
  return lines.join('\n')
}

// ─── Ingestion RAG ──────────────────────────────────────────────────

/** Crée un document de connaissance texte et lance son traitement (chunks + embeddings). */
async function ingestDoc(userId: string, agentId: string, name: string, content: string) {
  if (!content.trim()) return
  const supabase = admin()
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .insert({
      user_id: userId,
      name,
      doc_type: 'text',
      text_content: content,
      status: 'pending',
    })
    .select()
    .single()
  if (!doc) return

  // Rattacher à l'agent
  await supabase.from('agent_knowledge_documents').insert({ agent_id: agentId, document_id: doc.id })

  // Traiter (chunking + embeddings) — fire and forget
  await processDocument(doc.id)
}

// ─── Point d'entrée : auto-config ───────────────────────────────────

export type AutoConfigResult =
  | { ok: true; agentId: string; documents: number }
  | { ok: false; error: string }

/**
 * Crée automatiquement un agent + sa base de connaissances depuis la boutique.
 * Appelé après l'association d'une boutique Shopify à un utilisateur.
 */
export async function autoConfigureAgentFromShop(storeId: string): Promise<AutoConfigResult> {
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, user_id, shop_domain, access_token, shop_name')
    .eq('id', storeId)
    .single()

  if (!store || !store.user_id || !store.access_token) {
    return { ok: false, error: 'Boutique non associée à un utilisateur ou token manquant' }
  }

  const shop = store.shop_domain
  const token = decryptMessage(store.access_token)
  const shopName = store.shop_name || shop

  // 1. Créer l'agent
  const systemPrompt = `Tu es l'assistant de la boutique en ligne "${shopName}". Tu réponds aux clients sur WhatsApp de façon claire, chaleureuse et professionnelle. Tu aides sur les produits, les commandes, le suivi de livraison, le SAV et les retours. Base-toi TOUJOURS sur la base de connaissances (catalogue, pages et politiques de la boutique) pour répondre. Si tu n'as pas l'information, propose de transférer à un conseiller. Ne donne jamais d'information inventée.`

  const { data: agent } = await supabase
    .from('ai_agents')
    .insert({
      user_id: store.user_id,
      name: `Assistant ${shopName}`,
      description: `Agent SAV e-commerce auto-configuré depuis ${shop}`,
      system_prompt: systemPrompt,
      objective: 'Répondre aux clients (produits, commandes, SAV, retours) à partir des données de la boutique',
      model: 'gpt-4o',
      temperature: 0.7,
      agent_type: 'conversation',
      response_delay_min: 2,
      response_delay_max: 8,
      auto_detect_language: true,
      escalation_enabled: true,
      escalation_mode: 'both',
      escalation_keywords: ['humain', 'conseiller', 'parler à quelqu\'un'],
      is_active: true,
    })
    .select()
    .single()

  if (!agent) return { ok: false, error: 'Échec création agent' }

  // 2. Pull + ingestion (catalogue, pages, politiques)
  let documents = 0
  const [products, pages, policies] = await Promise.all([
    fetchAllProducts(shop, token),
    fetchAllPages(shop, token),
    fetchPolicies(shop, token),
  ])

  for (const [name, content] of [
    [`Catalogue — ${shopName}`, products],
    [`Pages — ${shopName}`, pages],
    [`Politiques — ${shopName}`, policies],
  ] as const) {
    if (content.trim().length > 20) {
      await ingestDoc(store.user_id, agent.id, name, content)
      documents++
    }
  }

  return { ok: true, agentId: agent.id, documents }
}
