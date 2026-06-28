import 'server-only'
import crypto from 'crypto'
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
          id
          title
          handle
          description
          productType
          vendor
          tags
          featuredImage { url }
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
      edges { cursor node { title body handle } }
      pageInfo { hasNextPage }
    }
  }`

const SHOP_POLICIES_QUERY = `
  {
    shop {
      name
      currencyCode
      shopPolicies { type title body url }
    }
  }`

// ─── Pull + formatage en texte ──────────────────────────────────────

type ProductNode = {
  id: string; title: string; handle: string
  description: string; productType: string; vendor: string; tags: string[]
  featuredImage: { url: string } | null
  variants: { edges: { node: { title: string; price: string; sku: string; availableForSale: boolean } }[] }
}

type ProductsResp = { products: { edges: { cursor: string; node: ProductNode }[]; pageInfo: { hasNextPage: boolean } } }

type ProductEdge = { cursor: string; node: ProductNode }
type VariantEdge = { node: { title: string; price: string; sku: string; availableForSale: boolean } }

/** Produit structuré (pour shopify_products + carrousels/liens IA). */
export type StructuredProduct = {
  shopify_id: string; title: string; handle: string | null; url: string | null
  image_url: string | null; price: string | null; available: boolean; position: number
}

async function fetchAllProducts(
  shop: string, token: string
): Promise<{ text: string; count: number; products: StructuredProduct[] }> {
  const lines: string[] = ['# Catalogue produits', '']
  const products: StructuredProduct[] = []
  let cursor: string | null = null
  let pages = 0
  let count = 0
  while (pages < 20) {
    const res = await shopifyGraphQL<ProductsResp>(shop, token, PRODUCTS_QUERY, { cursor })
    if (!res.ok) break
    const edges: ProductEdge[] = res.data.products.edges
    for (const { node: p } of edges) {
      count++
      lines.push(`## ${p.title}`)
      if (p.productType) lines.push(`Type : ${p.productType}`)
      if (p.vendor) lines.push(`Marque : ${p.vendor}`)
      if (p.description) lines.push(p.description.replace(/<[^>]+>/g, ' ').trim())
      const variants = p.variants.edges.map((v: VariantEdge) => `${v.node.title} — ${v.node.price}${v.node.availableForSale ? '' : ' (rupture)'}`)
      if (variants.length) lines.push(`Variantes : ${variants.join(' · ')}`)
      lines.push('')

      // Version structurée (pour carrousels/liens). URL construite depuis le
      // handle : {domain}/products/{handle} (toujours valide pour un produit publié).
      const firstVariant = p.variants.edges[0]?.node
      const url = p.handle ? `https://${shop}/products/${p.handle}` : null
      products.push({
        shopify_id: p.id,
        title: p.title,
        handle: p.handle || null,
        url,
        image_url: p.featuredImage?.url || null,
        price: firstVariant?.price || null,
        available: p.variants.edges.some((v) => v.node.availableForSale),
        position: count - 1,
      })
    }
    if (!res.data.products.pageInfo.hasNextPage) break
    cursor = edges.length ? edges[edges.length - 1].cursor : null
    if (!cursor) break
    pages++
  }
  return { text: lines.join('\n'), count, products }
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

/** Contexte boutique injecté aux agents : nom, devise, liens des politiques/pages. */
export type StoreContext = {
  name: string
  currency: string | null
  country: string | null
  links: { label: string; url: string }[]
}

/**
 * Récupère le contexte boutique (nom + devise + liens des politiques et pages).
 * Léger : 2 requêtes GraphQL. Stocké sur shopify_stores.store_context et injecté
 * dans le prompt de tous les agents.
 */
async function fetchStoreContext(shop: string, token: string, country: string | null): Promise<StoreContext | null> {
  const links: { label: string; url: string }[] = []

  // Politiques (url direct).
  const pol = await shopifyGraphQL<{ shop: { name: string; currencyCode: string; shopPolicies: { type: string; title: string; url: string }[] } }>(
    shop, token, SHOP_POLICIES_QUERY
  )
  let name = shop
  let currency: string | null = null
  if (pol.ok) {
    name = pol.data.shop.name || shop
    currency = pol.data.shop.currencyCode || null
    for (const p of pol.data.shop.shopPolicies || []) {
      if (p.url) links.push({ label: p.title, url: p.url })
    }
  }

  // Pages (url reconstruite depuis le handle).
  const pagesRes = await shopifyGraphQL<{ pages: { edges: { node: { title: string; handle: string } }[] } }>(
    shop, token, `{ pages(first: 50) { edges { node { title handle } } } }`
  )
  if (pagesRes.ok) {
    for (const { node } of pagesRes.data.pages.edges || []) {
      if (node.handle) links.push({ label: node.title, url: `https://${shop}/pages/${node.handle}` })
    }
  }

  return { name, currency, country, links }
}

/** Construit le bloc de contexte boutique à injecter dans le prompt d'un agent. */
export function buildStoreContextPrompt(ctx: StoreContext): string {
  const lines: string[] = ['--- Contexte boutique ---']
  const loc = [ctx.currency, ctx.country].filter(Boolean).join(', ')
  lines.push(`Tu réponds pour la boutique « ${ctx.name} »${loc ? ` (${loc})` : ''}.`)
  if (ctx.links.length > 0) {
    lines.push('Liens utiles à partager aux clients quand c\'est pertinent (donne le lien exact, ne l\'invente jamais) :')
    for (const l of ctx.links) lines.push(`- ${l.label} : ${l.url}`)
  }
  lines.push('--- Fin contexte boutique ---')
  return lines.join('\n')
}

// ─── Ingestion RAG ──────────────────────────────────────────────────

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Crée OU met à jour en place un document de connaissance (catalogue / pages /
 * politiques), puis le (re)traite (chunks + embeddings).
 *
 * Garde-fou anti-coût : si le contenu est identique au dernier ingéré (hash) et
 * que le doc existe déjà en `ready`, on NE re-génère PAS les embeddings.
 *
 * Renvoie { docId, hash, processed } : docId = id du document (créé ou existant),
 * processed = true si on a (re)traité (donc consommé des embeddings).
 */
/**
 * Remplace les produits structurés d'une boutique (table shopify_products).
 * On fait simple : delete-all puis insert (catalogues modestes ≤1000 produits).
 */
async function upsertStructuredProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  storeId: string,
  userId: string,
  products: StructuredProduct[]
): Promise<void> {
  try {
    await supabase.from('shopify_products').delete().eq('store_id', storeId)
    if (products.length === 0) return
    const rows = products.map((p) => ({
      store_id: storeId, user_id: userId,
      shopify_id: p.shopify_id, title: p.title, handle: p.handle,
      url: p.url, image_url: p.image_url, price: p.price,
      available: p.available, position: p.position,
    }))
    // Insert par lots de 500 (limite Postgrest).
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('shopify_products').insert(rows.slice(i, i + 500))
    }
  } catch (e) {
    console.error('[shopify] upsert produits structurés échec:', e)
  }
}

async function upsertDoc(args: {
  userId: string
  agentId: string | null
  existingDocId: string | null
  name: string
  content: string
  previousHash: string | null
}): Promise<{ docId: string | null; hash: string; processed: boolean }> {
  const supabase = admin()
  const hash = hashContent(args.content)

  // Le doc existant est-il toujours là et prêt ? (pour décider du skip)
  let existing: { id: string; status: string } | null = null
  if (args.existingDocId) {
    const { data } = await supabase
      .from('knowledge_documents')
      .select('id, status')
      .eq('id', args.existingDocId)
      .maybeSingle()
    existing = data
  }

  // Skip : contenu inchangé ET doc déjà prêt → coût zéro.
  if (existing && existing.status === 'ready' && args.previousHash === hash) {
    return { docId: existing.id, hash, processed: false }
  }

  if (existing) {
    // Mise à jour en place : processDocument supprime les anciens chunks.
    await supabase
      .from('knowledge_documents')
      .update({ name: args.name, text_content: args.content, status: 'pending', error_message: null })
      .eq('id', existing.id)
    await processDocument(existing.id)
    return { docId: existing.id, hash, processed: true }
  }

  // Création.
  const { data: doc } = await supabase
    .from('knowledge_documents')
    .insert({ user_id: args.userId, name: args.name, doc_type: 'text', text_content: args.content, status: 'pending' })
    .select()
    .single()
  if (!doc) return { docId: null, hash, processed: false }
  if (args.agentId) {
    await supabase.from('agent_knowledge_documents').insert({ agent_id: args.agentId, document_id: doc.id })
  }
  await processDocument(doc.id)
  return { docId: doc.id, hash, processed: true }
}

// ─── Resynchronisation d'une boutique déjà connectée ────────────────

export type SyncResult =
  | { ok: true; products: number; pages: boolean; policies: boolean; documents: number; processed: number }
  | { ok: false; error: string }

/**
 * Rafraîchit la base de connaissances d'une boutique DÉJÀ connectée (sans créer
 * de nouvel agent ni de documents en double). Met à jour en place les 3 docs
 * (catalogue / pages / politiques) référencés sur la boutique.
 *
 * scope 'catalog' : seulement le catalogue (webhooks produits).
 * scope 'all'     : catalogue + pages + politiques (bouton manuel, SHOP_UPDATE).
 */
export async function syncShopToKnowledge(
  storeId: string,
  opts: { scope?: 'all' | 'catalog' } = {}
): Promise<SyncResult> {
  const scope = opts.scope || 'all'
  const supabase = admin()

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, user_id, shop_domain, access_token, shop_name, country, catalog_doc_id, pages_doc_id, policies_doc_id, content_hashes, last_sync_summary')
    .eq('id', storeId)
    .single()
  if (!store || !store.user_id || !store.access_token) {
    return { ok: false, error: 'Boutique non associée ou token manquant' }
  }

  const shop = store.shop_domain
  const token = decryptMessage(store.access_token)
  const shopName = store.shop_name || shop
  const hashes = (store.content_hashes || {}) as { catalog?: string; pages?: string; policies?: string }

  // Les documents BOUTIQUE ne sont PAS liés à un agent : ils sont globaux au
  // compte et inclus automatiquement dans le RAG de tous les agents (cf.
  // retrieveContext qui les fusionne via shopify_stores). On passe donc
  // toujours agentId=null.

  let products = 0
  let pagesPresent = (store.last_sync_summary as { pages?: boolean } | null)?.pages ?? false
  let policiesPresent = (store.last_sync_summary as { policies?: boolean } | null)?.policies ?? false
  let processed = 0
  let documents = 0
  const newHashes = { ...hashes }
  const updates: Record<string, unknown> = {}

  // Catalogue (toujours, pour les 2 scopes).
  {
    const { text, count, products: structured } = await fetchAllProducts(shop, token)
    products = count
    if (text.trim().length > 20) {
      const r = await upsertDoc({ userId: store.user_id, agentId: null, existingDocId: store.catalog_doc_id, name: `Catalogue — ${shopName}`, content: text, previousHash: hashes.catalog || null })
      if (r.docId) { updates.catalog_doc_id = r.docId; newHashes.catalog = r.hash; documents++; if (r.processed) processed++ }
    }
    // Produits structurés (pour carrousels/liens des templates IA).
    await upsertStructuredProducts(supabase, storeId, store.user_id, structured)
    updates.catalog_synced_at = new Date().toISOString()
  }

  if (scope === 'all') {
    const [pagesText, policiesText] = await Promise.all([
      fetchAllPages(shop, token),
      fetchPolicies(shop, token),
    ])
    pagesPresent = pagesText.trim().length > 20
    policiesPresent = policiesText.trim().length > 20

    if (pagesPresent) {
      const r = await upsertDoc({ userId: store.user_id, agentId: null, existingDocId: store.pages_doc_id, name: `Pages — ${shopName}`, content: pagesText, previousHash: hashes.pages || null })
      if (r.docId) { updates.pages_doc_id = r.docId; newHashes.pages = r.hash; documents++; if (r.processed) processed++ }
    }
    if (policiesPresent) {
      const r = await upsertDoc({ userId: store.user_id, agentId: null, existingDocId: store.policies_doc_id, name: `Politiques — ${shopName}`, content: policiesText, previousHash: hashes.policies || null })
      if (r.docId) { updates.policies_doc_id = r.docId; newHashes.policies = r.hash; documents++; if (r.processed) processed++ }
    }
    // Contexte boutique (nom + devise + liens) → injecté aux agents.
    const ctx = await fetchStoreContext(shop, token, (store as { country?: string | null }).country ?? null)
    if (ctx) updates.store_context = ctx
    updates.last_synced_at = new Date().toISOString()
  }

  updates.content_hashes = newHashes
  updates.last_sync_summary = { products, pages: pagesPresent, policies: policiesPresent, at: new Date().toISOString() }
  await supabase.from('shopify_stores').update(updates).eq('id', storeId)

  return { ok: true, products, pages: pagesPresent, policies: policiesPresent, documents, processed }
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
    .select('id, user_id, shop_domain, access_token, shop_name, country')
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

  // 2. Pull + ingestion (catalogue, pages, politiques) via upsertDoc (création
  // ici, mais on persiste les doc-ids/hashes/summary pour les resync futurs).
  let documents = 0
  const { text: products, count: productCount, products: structuredProducts } = await fetchAllProducts(shop, token)
  await upsertStructuredProducts(supabase, storeId, store.user_id, structuredProducts)
  const [pages, policies] = await Promise.all([
    fetchAllPages(shop, token),
    fetchPolicies(shop, token),
  ])

  const docUpdates: Record<string, unknown> = {}
  const hashes: Record<string, string> = {}
  const pagesPresent = pages.trim().length > 20
  const policiesPresent = policies.trim().length > 20

  for (const [key, idCol, name, content] of [
    ['catalog', 'catalog_doc_id', `Catalogue — ${shopName}`, products],
    ['pages', 'pages_doc_id', `Pages — ${shopName}`, pages],
    ['policies', 'policies_doc_id', `Politiques — ${shopName}`, policies],
  ] as const) {
    if (content.trim().length > 20) {
      // Docs boutique GLOBAUX (non liés à un agent) : le RAG les inclut pour tous.
      const r = await upsertDoc({ userId: store.user_id, agentId: null, existingDocId: null, name, content, previousHash: null })
      if (r.docId) { docUpdates[idCol] = r.docId; hashes[key] = r.hash; documents++ }
    }
  }

  // Contexte boutique (nom + devise + liens) → injecté aux agents.
  const storeCtx = await fetchStoreContext(shop, token, (store as { country?: string | null }).country ?? null)

  const now = new Date().toISOString()
  await supabase.from('shopify_stores').update({
    ...docUpdates,
    content_hashes: hashes,
    last_synced_at: now,
    catalog_synced_at: now,
    store_context: storeCtx || undefined,
    last_sync_summary: { products: productCount, pages: pagesPresent, policies: policiesPresent, at: now },
  }).eq('id', storeId)

  return { ok: true, agentId: agent.id, documents }
}
