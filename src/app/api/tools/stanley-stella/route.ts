import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/tools/stanley-stella
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, query, sku, style_code, category, color, size } = body

    // Credentials: from Basic Auth header, env vars, or request body
    let user = process.env.STANLEY_STELLA_USER || body.user
    let password = process.env.STANLEY_STELLA_PASSWORD || body.password

    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString()
      const [u, ...pParts] = decoded.split(':')
      if (u && pParts.length) {
        user = u
        password = pParts.join(':') // password may contain ':'
      }
    }

    if (!user || !password) {
      return NextResponse.json({ error: 'Missing Stanley Stella credentials' }, { status: 400 })
    }

    const allProducts = await fetchAllProducts(user, password)

    let filtered = allProducts

    // Filter by SKU (exact match)
    if (sku) {
      filtered = filtered.filter(p => p.B2BSKUREF.toLowerCase() === sku.toLowerCase())
    }

    // Filter by style code
    if (style_code) {
      filtered = filtered.filter(p => p.StyleCode.toLowerCase() === style_code.toLowerCase())
    }

    // Filter by category (T-shirt, Sweat, etc.)
    if (category) {
      const cat = category.toLowerCase()
      filtered = filtered.filter(p =>
        p.Type?.toLowerCase().includes(cat) || p.Category?.toLowerCase().includes(cat)
      )
    }

    // Filter by color
    if (color) {
      const col = color.toLowerCase()
      filtered = filtered.filter(p => p.Color?.toLowerCase().includes(col))
    }

    // Filter by size
    if (size) {
      const sz = size.toUpperCase()
      filtered = filtered.filter(p => p.SizeCode?.toUpperCase() === sz)
    }

    // Search by name (fuzzy)
    if (query) {
      const q = query.toLowerCase()
      filtered = filtered.filter(p =>
        p.StyleName?.toLowerCase().includes(q) ||
        p.B2BSKUREF?.toLowerCase().includes(q) ||
        p.ShortDescription?.toLowerCase().includes(q)
      )
    }

    if (action === 'check_stock') {
      // Return only stock-relevant data
      const results = filtered.slice(0, 50).map(p => ({
        sku: p.B2BSKUREF,
        style: p.StyleName,
        color: p.Color,
        size: p.SizeCode,
        stock: p.Stock,
        category: p.Type,
      }))

      return NextResponse.json({
        count: filtered.length,
        showing: results.length,
        results,
      })
    }

    if (action === 'search_product') {
      // Return product details
      // Group by style to avoid duplicates
      const styleMap = new Map<string, {
        style_code: string
        name: string
        category: string
        gender: string
        description: string
        composition: string
        weight: number
        fit: string
        colors: string[]
        sizes: string[]
        total_stock: number
        price_1_10: number
        price_10_plus: number
        price_50_plus: number
      }>()

      for (const p of filtered.slice(0, 200)) {
        const existing = styleMap.get(p.StyleCode)
        if (existing) {
          if (!existing.colors.includes(p.Color)) existing.colors.push(p.Color)
          if (!existing.sizes.includes(p.SizeCode)) existing.sizes.push(p.SizeCode)
          existing.total_stock += p.Stock
        } else {
          styleMap.set(p.StyleCode, {
            style_code: p.StyleCode,
            name: p.StyleName,
            category: p.Type,
            gender: p.Gender,
            description: p.ShortDescription || '',
            composition: p.CompositionList || '',
            weight: p.Weight || 0,
            fit: p.Fit || '',
            colors: [p.Color],
            sizes: [p.SizeCode],
            total_stock: p.Stock,
            price_1_10: p['Price<10 EUR'] || 0,
            price_10_plus: p['Price>10 EUR'] || 0,
            price_50_plus: p['Price>50 EUR'] || 0,
          })
        }
      }

      return NextResponse.json({
        count: styleMap.size,
        results: Array.from(styleMap.values()).slice(0, 20),
      })
    }

    // Default: return compact list
    const results = filtered.slice(0, 50).map(p => ({
      sku: p.B2BSKUREF,
      style: p.StyleName,
      color: p.Color,
      size: p.SizeCode,
      stock: p.Stock,
      price: p['Price>10 EUR'] || p['Price<10 EUR'] || 0,
    }))

    return NextResponse.json({ count: filtered.length, showing: results.length, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
