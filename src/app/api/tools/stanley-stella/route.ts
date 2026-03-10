import { NextRequest, NextResponse } from 'next/server'

/**
 * GET & POST /api/tools/stanley-stella
 * Proxy for Stanley Stella JSON-RPC API.
 * Fetches all products, filters by query/sku/category, and returns compact results.
 * This avoids sending 38MB to OpenAI — only relevant results are returned.
 */

type SSProduct = {
  B2BSKUREF: string
  StyleCode: string
  StyleName: string
  Color: string
  ColorCode: string
  SizeCode: string
  Stock: number
  Type: string
  Category: string
  Gender: string
  'Price<10 EUR'?: number
  'Price>10 EUR'?: number
  'Price>50 EUR'?: number
  'Price>100 EUR'?: number
  'Price>250 EUR'?: number
  'Price>500 EUR'?: number
  ShortDescription?: string
  Weight?: number
  CompositionList?: string
  Fit?: string
}

// Cache products for 10 minutes to avoid re-fetching 38MB every call
let cachedProducts: SSProduct[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 10 * 60 * 1000

async function fetchAllProducts(user: string, password: string): Promise<SSProduct[]> {
  const now = Date.now()
  if (cachedProducts && now - cacheTimestamp < CACHE_TTL) {
    return cachedProducts
  }

  const res = await fetch('https://api.stanleystella.com/webrequest/products/get_json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        db_name: 'production_api',
        user,
        password,
        LanguageCode: 'fr_FR',
      },
      id: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`Stanley Stella API error: ${res.status}`)
  }

  const json = await res.json()
  const products: SSProduct[] = JSON.parse(json.result)
  cachedProducts = products
  cacheTimestamp = now
  return products
}

function extractCredentials(req: NextRequest, body?: Record<string, unknown>): { user: string; password: string } | null {
  // 1. Try Authorization header (Basic or Bearer with user:pass)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString()
    const [u, ...pParts] = decoded.split(':')
    if (u && pParts.length) return { user: u, password: pParts.join(':') }
  } else if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token.includes(':')) {
      const [u, ...pParts] = token.split(':')
      if (u && pParts.length) return { user: u, password: pParts.join(':') }
    }
  }

  // 2. Try request body
  if (body?.user && body?.password) {
    return { user: body.user as string, password: body.password as string }
  }

  // 3. Try env vars
  const envUser = process.env.STANLEY_STELLA_USER
  const envPass = process.env.STANLEY_STELLA_PASSWORD
  if (envUser && envPass) return { user: envUser, password: envPass }

  return null
}

function filterProducts(allProducts: SSProduct[], params: Record<string, unknown>) {
  const { action, query, sku, style_code, category, color, size } = params
  let filtered = allProducts

  if (sku) {
    filtered = filtered.filter(p => p.B2BSKUREF.toLowerCase() === String(sku).toLowerCase())
  }
  if (style_code) {
    filtered = filtered.filter(p => p.StyleCode.toLowerCase() === String(style_code).toLowerCase())
  }
  if (category) {
    const cat = String(category).toLowerCase()
    filtered = filtered.filter(p =>
      p.Type?.toLowerCase().includes(cat) || p.Category?.toLowerCase().includes(cat)
    )
  }
  if (color) {
    const col = String(color).toLowerCase()
    filtered = filtered.filter(p => p.Color?.toLowerCase().includes(col))
  }
  if (size) {
    const sz = String(size).toUpperCase()
    filtered = filtered.filter(p => p.SizeCode?.toUpperCase() === sz)
  }
  if (query) {
    const q = String(query).toLowerCase()
    filtered = filtered.filter(p =>
      p.StyleName?.toLowerCase().includes(q) ||
      p.B2BSKUREF?.toLowerCase().includes(q) ||
      p.ShortDescription?.toLowerCase().includes(q)
    )
  }

  if (action === 'check_stock') {
    const results = filtered.slice(0, 50).map(p => ({
      sku: p.B2BSKUREF, style: p.StyleName, color: p.Color,
      size: p.SizeCode, stock: p.Stock, category: p.Type,
    }))
    return { count: filtered.length, showing: results.length, results }
  }

  if (action === 'search_product') {
    const styleMap = new Map<string, {
      style_code: string; name: string; category: string; gender: string
      description: string; composition: string; weight: number; fit: string
      colors: string[]; sizes: string[]; total_stock: number
      price_1_10: number; price_10_plus: number; price_50_plus: number
    }>()

    for (const p of filtered.slice(0, 200)) {
      const existing = styleMap.get(p.StyleCode)
      if (existing) {
        if (!existing.colors.includes(p.Color)) existing.colors.push(p.Color)
        if (!existing.sizes.includes(p.SizeCode)) existing.sizes.push(p.SizeCode)
        existing.total_stock += p.Stock
      } else {
        styleMap.set(p.StyleCode, {
          style_code: p.StyleCode, name: p.StyleName, category: p.Type,
          gender: p.Gender, description: p.ShortDescription || '',
          composition: p.CompositionList || '', weight: p.Weight || 0,
          fit: p.Fit || '', colors: [p.Color], sizes: [p.SizeCode],
          total_stock: p.Stock, price_1_10: p['Price<10 EUR'] || 0,
          price_10_plus: p['Price>10 EUR'] || 0, price_50_plus: p['Price>50 EUR'] || 0,
        })
      }
    }
    return { count: styleMap.size, results: Array.from(styleMap.values()).slice(0, 20) }
  }

  // Default
  const results = filtered.slice(0, 50).map(p => ({
    sku: p.B2BSKUREF, style: p.StyleName, color: p.Color,
    size: p.SizeCode, stock: p.Stock,
    price: p['Price>10 EUR'] || p['Price<10 EUR'] || 0,
  }))
  return { count: filtered.length, showing: results.length, results }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* empty body */ }
    const creds = extractCredentials(req, body)
    if (!creds) {
      return NextResponse.json({ error: 'Missing Stanley Stella credentials' }, { status: 400 })
    }

    const allProducts = await fetchAllProducts(creds.user, creds.password)
    return NextResponse.json(filterProducts(allProducts, body))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const params: Record<string, unknown> = {}
    for (const [key, value] of url.searchParams) {
      params[key] = value
    }

    const creds = extractCredentials(req, params)
    if (!creds) {
      return NextResponse.json({ error: 'Missing Stanley Stella credentials' }, { status: 400 })
    }

    const allProducts = await fetchAllProducts(creds.user, creds.password)
    return NextResponse.json(filterProducts(allProducts, params))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
