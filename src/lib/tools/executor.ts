import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { validateToolUrl, truncateResponse, sanitizeParams } from './security'
import { TOOL_TEMPLATES, toOpenAIFunction, buildCustomFunctions, type ToolFunction } from './templates'
import { refreshAccessToken } from '@/lib/oauth/google'
import { isValidExternalUrl } from '@/lib/security/url-validator'
import type { AgentTool } from '@/types/database'

const TOOL_TIMEOUT_MS = 60_000
const MAX_RESPONSE_BYTES = 50_000

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) {
    console.error('[Tools] SUPABASE_SERVICE_ROLE_KEY is not set!')
  }
  return createAdminSupabase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ============================================================
// Config encryption helpers
// ============================================================

export function encryptToolConfig(config: Record<string, unknown>): Record<string, unknown> {
  const encrypted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && isSecretField(key)) {
      encrypted[key] = encryptMessage(value)
    } else {
      encrypted[key] = value
    }
  }
  return encrypted
}

export function decryptToolConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && isSecretField(key)) {
      decrypted[key] = decryptMessage(value)
    } else {
      decrypted[key] = value
    }
  }
  return decrypted
}

function isSecretField(key: string): boolean {
  const secretKeys = ['access_token', 'refresh_token', 'api_key', 'consumer_key', 'consumer_secret', 'secret', 'password', 'token']
  return secretKeys.some(s => key.toLowerCase().includes(s))
}

// ============================================================
// Convert agent tools to OpenAI function calling format
// ============================================================

export function buildOpenAITools(tools: AgentTool[]) {
  const openaiTools: ReturnType<typeof toOpenAIFunction>[] = []
  const functionMap = new Map<string, { tool: AgentTool; fn: ToolFunction }>()

  for (const tool of tools) {
    if (!tool.is_active) continue

    let functions: ToolFunction[]

    if (tool.tool_type === 'custom') {
      functions = buildCustomFunctions(tool.config)
    } else {
      const template = TOOL_TEMPLATES[tool.tool_type]
      if (!template) continue
      functions = template.functions
    }

    // Filter functions based on tool permissions
    const allowedFunctions = functions.filter((fn) => {
      if (tool.permissions === 'read_write') return true
      if (tool.permissions === 'read' && fn.permission === 'read') return true
      if (tool.permissions === 'write' && fn.permission === 'write') return true
      return false
    })

    for (const fn of allowedFunctions) {
      const toolNameSlug = tool.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30)
      const openaiTool = toOpenAIFunction(fn, toolNameSlug)
      openaiTools.push(openaiTool)
      functionMap.set(openaiTool.function.name, { tool, fn })
    }
  }

  return { openaiTools, functionMap }
}

// ============================================================
// Execute a tool call
// ============================================================

// ============================================================
// Credential resolution (shared oauth_credentials or inline)
// ============================================================

async function resolveToolConfig(
  tool: AgentTool
): Promise<{ config: Record<string, unknown>; credentialId: string | null }> {
  const baseConfig = decryptToolConfig(tool.config)

  if (!tool.credential_id) {
    return { config: baseConfig, credentialId: null }
  }

  const supabase = getAdminClient()
  const { data: cred, error } = await supabase
    .from('oauth_credentials')
    .select('*')
    .eq('id', tool.credential_id)
    .single()

  if (error || !cred) {
    console.error('[Tools] Credential not found:', tool.credential_id)
    throw new Error('Referenced credential not found. Please reconnect.')
  }

  const credType = cred.credential_type || 'oauth2'

  if (credType === 'oauth2') {
    // OAuth2: merge client_id, client_secret, tokens
    return {
      config: {
        ...baseConfig,
        client_id: cred.client_id,
        client_secret: cred.client_secret ? decryptMessage(cred.client_secret) : baseConfig.client_secret,
        access_token: cred.access_token ? decryptMessage(cred.access_token) : baseConfig.access_token,
        refresh_token: cred.refresh_token ? decryptMessage(cred.refresh_token) : baseConfig.refresh_token,
        token_expires_at: cred.token_expires_at || baseConfig.token_expires_at,
      },
      credentialId: cred.id,
    }
  }

  // Non-OAuth: decrypt secrets from metadata and merge into config
  const metadata = (cred.metadata || {}) as Record<string, unknown>
  const decryptedSecrets: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && isSecretField(key)) {
      try {
        decryptedSecrets[key] = decryptMessage(value)
      } catch {
        decryptedSecrets[key] = value
      }
    } else {
      decryptedSecrets[key] = value
    }
  }

  // Map credential type to the expected config fields
  const mergedConfig = { ...baseConfig, ...decryptedSecrets }

  // For basic auth, also set auth_type so executeCustomTool knows
  if (credType === 'basic') {
    mergedConfig.auth_type = mergedConfig.auth_type || 'basic'
    // Map username/password to the fields custom tool executor expects
    if (decryptedSecrets.username && decryptedSecrets.password) {
      mergedConfig.api_key = `${decryptedSecrets.username}:${decryptedSecrets.password}`
    }
  } else if (credType === 'api_key') {
    mergedConfig.auth_type = mergedConfig.auth_type || 'api_key'
    if (decryptedSecrets.api_key) mergedConfig.api_key = decryptedSecrets.api_key
  } else if (credType === 'bearer') {
    mergedConfig.auth_type = mergedConfig.auth_type || 'bearer'
    if (decryptedSecrets.token) mergedConfig.api_key = decryptedSecrets.token
  }

  return {
    config: mergedConfig,
    credentialId: cred.id,
  }
}

export async function executeToolCall(
  tool: AgentTool,
  fn: ToolFunction,
  args: Record<string, unknown>,
  context: { userId: string; agentId: string; conversationId?: string }
): Promise<{ success: boolean; result: string; durationMs: number }> {
  const startTime = Date.now()
  const supabase = getAdminClient()
  const { config, credentialId } = await resolveToolConfig(tool)
  const cleanArgs = sanitizeParams(args)

  // Check rate limit
  const { data: allowed } = await supabase.rpc('check_tool_rate_limit', {
    p_tool_id: tool.id,
    p_rate_limit: tool.rate_limit,
  })

  if (!allowed) {
    const duration = Date.now() - startTime
    await logExecution(supabase, {
      ...context,
      toolId: tool.id,
      functionName: fn.name,
      parameters: cleanArgs,
      result: null,
      status: 'rate_limited',
      errorMessage: 'Rate limit exceeded',
      durationMs: duration,
    })
    return { success: false, result: 'Rate limit exceeded. Please try again later.', durationMs: duration }
  }

  try {
    let result: string

    if (tool.tool_type === 'custom') {
      result = await executeCustomTool(config, fn.name, cleanArgs)
    } else {
      result = await executeTemplateTool(tool, tool.tool_type, config, fn.name, cleanArgs, credentialId, context)
    }

    const truncated = truncateResponse(result, MAX_RESPONSE_BYTES)
    const duration = Date.now() - startTime

    await logExecution(supabase, {
      ...context,
      toolId: tool.id,
      functionName: fn.name,
      parameters: cleanArgs,
      result: { data: truncated },
      status: 'success',
      errorMessage: null,
      durationMs: duration,
    })

    return { success: true, result: truncated, durationMs: duration }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const isTimeout = error?.name === 'AbortError' || duration >= TOOL_TIMEOUT_MS

    await logExecution(supabase, {
      ...context,
      toolId: tool.id,
      functionName: fn.name,
      parameters: cleanArgs,
      result: null,
      status: isTimeout ? 'timeout' : 'error',
      errorMessage: error?.message || 'Unknown error',
      durationMs: duration,
    })

    return {
      success: false,
      result: isTimeout ? 'Request timed out.' : `Error: ${error?.message || 'Unknown error'}`,
      durationMs: duration,
    }
  }
}

// ============================================================
// OAuth auto-refresh
// ============================================================

async function ensureValidAccessToken(
  tool: AgentTool,
  config: Record<string, unknown>,
  credentialId?: string | null
): Promise<string> {
  const accessToken = config.access_token as string
  const refreshToken = config.refresh_token as string
  const expiresAt = config.token_expires_at as string | undefined
  const clientId = config.client_id as string
  const clientSecret = config.client_secret as string

  // If no expiry info or no refresh token, return what we have
  if (!refreshToken || !clientId || !clientSecret) {
    return accessToken || ''
  }

  // Check if token is expired (with 5min buffer)
  if (expiresAt) {
    const expiresDate = new Date(expiresAt)
    const now = new Date(Date.now() + 5 * 60 * 1000) // 5min buffer
    if (expiresDate > now) {
      return accessToken
    }
  }

  // Token expired or no expiry info — refresh it
  console.log(`[Tools] Refreshing OAuth token for tool ${tool.id}${credentialId ? ` (credential ${credentialId})` : ''}`)
  try {
    const tokens = await refreshAccessToken({ refreshToken, clientId, clientSecret })
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const supabase = getAdminClient()

    if (credentialId) {
      // Update the shared credential
      await supabase
        .from('oauth_credentials')
        .update({
          access_token: encryptMessage(tokens.access_token),
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', credentialId)
    } else {
      // Legacy: update inline in agent_tools
      const updatedConfig = encryptToolConfig({
        ...config,
        access_token: tokens.access_token,
        token_expires_at: newExpiresAt,
      })

      await supabase
        .from('agent_tools')
        .update({ config: updatedConfig, updated_at: new Date().toISOString() })
        .eq('id', tool.id)
    }

    return tokens.access_token
  } catch (err) {
    console.error('[Tools] Failed to refresh OAuth token:', err)
    throw new Error('OAuth token expired and refresh failed. Please reconnect the tool.')
  }
}

// ============================================================
// Template executors
// ============================================================

async function executeTemplateTool(
  tool: AgentTool,
  toolType: string,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  credentialId?: string | null,
  context?: { userId: string; agentId: string; conversationId?: string }
): Promise<string> {
  switch (toolType) {
    case 'google_calendar':
      return executeGoogleCalendar(tool, config, functionName, args, credentialId)
    case 'shopify':
      return executeShopify(config, functionName, args)
    case 'woocommerce':
      return executeWooCommerce(config, functionName, args)
    case 'stripe':
      return executeStripe(config, functionName, args)
    case 'google_sheets':
      return executeGoogleSheets(tool, config, functionName, args, credentialId)
    case 'google_gmail':
      return executeGoogleGmail(tool, config, functionName, args, credentialId)
    case 'whatsapp_message':
      return executeWhatsAppMessage(config, functionName, args, context)
    case 'distance_calculator':
      return executeDistanceCalculator(config, functionName, args)
    case 'app_notification':
      return executeAppNotification(config, functionName, args, context)
    default:
      throw new Error(`Unknown template: ${toolType}`)
  }
}

// --- App Notification ---
async function executeAppNotification(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  context?: { userId: string; agentId: string; conversationId?: string }
): Promise<string> {
  if (functionName !== 'send_notification') throw new Error(`Unknown function: ${functionName}`)

  if (!context?.userId) return JSON.stringify({ error: 'Missing user context' })

  const title = (args.title as string) || (config.default_title as string) || 'Notification agent IA'
  const message = args.message as string
  const priority = (args.priority as string) || 'normal'
  const alertType = (config.alert_type as string) || 'agent_alert'

  if (!message) return JSON.stringify({ error: 'message is required' })

  const supabase = getAdminClient()

  await supabase.from('user_alerts').insert({
    user_id: context.userId,
    alert_type: alertType,
    title,
    message,
    metadata: {
      agent_id: context.agentId,
      conversation_id: context.conversationId || null,
      priority,
      triggered_by: 'agent_tool',
    },
  })

  return JSON.stringify({ sent: true, title, priority })
}

// --- Distance Calculator (Nominatim + OSRM, 100% gratuit) ---
async function executeDistanceCalculator(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  if (functionName !== 'calculate_price') throw new Error(`Unknown function: ${functionName}`)

  const origin = args.origin as string
  const destination = args.destination as string
  const nightTrip = args.night_trip === true

  const minimumPrice = parseFloat((config.minimum_price as string) || '120')
  const nightSurcharge = parseFloat((config.night_surcharge as string) || '15') / 100

  // Build vehicle list from JSON config (new format: vehicles array)
  const vehicles: Array<{ name: string; pricePerKm: number; minimumPrice: number | null }> = []
  try {
    const raw = config.vehicles as string
    const parsed: Array<{ name: string; price_per_km: string; minimum_price?: string }> = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : [])
    for (const v of parsed) {
      const pricePerKm = parseFloat(v.price_per_km || '0')
      const vehicleMin = v.minimum_price ? parseFloat(v.minimum_price) : null
      if (v.name?.trim() && pricePerKm > 0) {
        vehicles.push({ name: v.name.trim(), pricePerKm, minimumPrice: vehicleMin })
      }
    }
  } catch { /* ignore parse errors */ }
  // Fallback if no vehicles configured
  if (vehicles.length === 0) {
    vehicles.push({ name: 'Véhicule standard', pricePerKm: 2.50, minimumPrice: null })
  }

  // Geocode address via Nominatim (OpenStreetMap)
  async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=fr`
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'AutyviaApp/1.0 (contact@autyvia.fr)' },
    })
    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  }

  const [orig, dest] = await Promise.all([geocode(origin), geocode(destination)])

  if (!orig) return JSON.stringify({ error: `Adresse de départ introuvable : "${origin}". Demandez au client de préciser l'adresse.` })
  if (!dest) return JSON.stringify({ error: `Adresse de destination introuvable : "${destination}". Demandez au client de préciser l'adresse.` })

  // Calculate route distance via OSRM
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${orig.lon},${orig.lat};${dest.lon},${dest.lat}?overview=false`
  const osrmRes = await fetchWithTimeout(osrmUrl, {
    headers: { 'User-Agent': 'AutyviaApp/1.0' },
  })
  const osrmData = await osrmRes.json() as { routes?: Array<{ distance: number; duration: number }> }

  if (!osrmData.routes?.length) {
    return JSON.stringify({ error: 'Impossible de calculer l\'itinéraire. Vérifiez les adresses.' })
  }

  const distanceKm = Math.round(osrmData.routes[0].distance / 1000 * 10) / 10
  const durationMin = Math.round(osrmData.routes[0].duration / 60)

  // Calculate prices for each configured vehicle
  const calcPrice = (pricePerKm: number, vehicleMin: number | null) => {
    let price = distanceKm * pricePerKm
    if (nightTrip) price *= (1 + nightSurcharge)
    // Use vehicle-specific minimum if set, otherwise global minimum
    const effectiveMin = vehicleMin !== null ? vehicleMin : minimumPrice
    return Math.max(effectiveMin, Math.round(price * 100) / 100)
  }

  const prices: Record<string, number> = {}
  for (const v of vehicles) {
    prices[v.name] = calcPrice(v.pricePerKm, v.minimumPrice)
  }

  return JSON.stringify({
    origin,
    destination,
    distance_km: distanceKm,
    duration_min: durationMin,
    night_surcharge_applied: nightTrip,
    prices,
    minimum_price: minimumPrice,
  })
}

// --- Google Calendar ---
async function executeGoogleCalendar(
  tool: AgentTool,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  credentialId?: string | null
): Promise<string> {
  const accessToken = await ensureValidAccessToken(tool, config, credentialId)
  const calendarId = (config.calendar_id as string) || 'primary'
  const baseUrl = 'https://www.googleapis.com/calendar/v3'

  if (functionName === 'check_availability') {
    const date = args.date as string
    const durationMin = (args.duration_minutes as number) || 60
    const timeMin = `${date}T00:00:00Z`
    const timeMax = `${date}T23:59:59Z`
    const res = await fetchWithTimeout(
      `${baseUrl}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()
    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
    }))
    return JSON.stringify({ date, events, busySlots: events.length, suggestedDuration: durationMin })
  }

  if (functionName === 'create_event') {
    const timeZone = (config.timezone as string) || 'Europe/Paris'
    const res = await fetchWithTimeout(
      `${baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: args.title,
          start: { dateTime: args.start_datetime, timeZone },
          end: { dateTime: args.end_datetime, timeZone },
          description: args.description || '',
          attendees: args.attendee_email ? [{ email: args.attendee_email }] : [],
        }),
      }
    )
    const data = await res.json()
    return JSON.stringify({ created: true, eventId: data.id, link: data.htmlLink })
  }

  if (functionName === 'cancel_event') {
    await fetchWithTimeout(
      `${baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${args.event_id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    )
    return JSON.stringify({ cancelled: true, eventId: args.event_id })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- Shopify ---
async function executeShopify(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const shopUrl = (config.shop_url as string).replace(/^https?:\/\//, '').replace(/\/$/, '')
  const shopFullUrl = `https://${shopUrl}`
  if (!isValidExternalUrl(shopFullUrl)) {
    return JSON.stringify({ success: false, error: 'Invalid or blocked URL' })
  }
  const token = config.access_token as string
  const baseUrl = `https://${shopUrl}/admin/api/2024-01`
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

  if (functionName === 'search_product') {
    const limit = Math.min((args.limit as number) || 5, 20)
    const res = await fetchWithTimeout(`${baseUrl}/products.json?title=${encodeURIComponent(args.query as string)}&limit=${limit}`, { headers })
    const data = await res.json()
    const products = (data.products || []).map((p: any) => ({
      id: String(p.id),
      title: p.title,
      description: p.body_html?.replace(/<[^>]*>/g, '').slice(0, 150) || '',
      price: p.variants?.[0]?.price,
      compare_at_price: p.variants?.[0]?.compare_at_price || null,
      available: p.variants?.[0]?.inventory_quantity > 0,
      inventory: p.variants?.[0]?.inventory_quantity,
      image_url: p.image?.src || p.images?.[0]?.src || null,
      variants_count: p.variants?.length || 0,
      vendor: p.vendor || null,
      product_type: p.product_type || null,
    }))
    return JSON.stringify({ products, total: products.length })
  }

  if (functionName === 'get_product_details') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}.json`, { headers })
    const data = await res.json()
    const p = data.product
    if (!p) return JSON.stringify({ error: 'Product not found' })
    return JSON.stringify({
      id: String(p.id),
      title: p.title,
      description: p.body_html?.replace(/<[^>]*>/g, '').slice(0, 500) || '',
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
      images: (p.images || []).slice(0, 5).map((img: any) => img.src),
      variants: (p.variants || []).map((v: any) => ({
        id: String(v.id),
        title: v.title,
        price: v.price,
        compare_at_price: v.compare_at_price,
        sku: v.sku,
        available: v.inventory_quantity > 0,
        inventory: v.inventory_quantity,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
      })),
    })
  }

  if (functionName === 'check_stock') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}.json`, { headers })
    const data = await res.json()
    if (!data.product) return JSON.stringify({ error: 'Product not found' })
    const variants = (data.product.variants || []).map((v: any) => ({
      title: v.title, price: v.price, sku: v.sku,
      available: v.inventory_quantity > 0, quantity: v.inventory_quantity,
    }))
    const totalStock = variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
    return JSON.stringify({ product: data.product.title, total_stock: totalStock, in_stock: totalStock > 0, variants })
  }

  if (functionName === 'get_order_status') {
    const orderNum = (args.order_number as string).replace('#', '')
    const res = await fetchWithTimeout(`${baseUrl}/orders.json?name=${orderNum}&status=any&limit=1`, { headers })
    const data = await res.json()
    const order = data.orders?.[0]
    if (!order) return JSON.stringify({ found: false, order_number: orderNum })
    return JSON.stringify({
      found: true,
      order_number: order.name,
      status: order.financial_status,
      fulfillment: order.fulfillment_status || 'unfulfilled',
      total: order.total_price,
      currency: order.currency,
      created_at: order.created_at,
      line_items: (order.line_items || []).slice(0, 10).map((li: any) => ({
        title: li.title, quantity: li.quantity, price: li.price,
      })),
      tracking: order.fulfillments?.[0] ? {
        company: order.fulfillments[0].tracking_company,
        number: order.fulfillments[0].tracking_number,
        url: order.fulfillments[0].tracking_url,
      } : null,
    })
  }

  if (functionName === 'list_collections') {
    const limit = Math.min((args.limit as number) || 10, 50)
    const res = await fetchWithTimeout(`${baseUrl}/custom_collections.json?limit=${limit}`, { headers })
    const data = await res.json()
    const collections = (data.custom_collections || []).map((c: any) => ({
      id: String(c.id), title: c.title, products_count: c.products_count || null,
    }))
    return JSON.stringify({ collections, total: collections.length })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- WooCommerce ---
async function executeWooCommerce(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const siteUrl = (config.site_url as string).replace(/\/$/, '')
  if (!isValidExternalUrl(siteUrl)) {
    return JSON.stringify({ success: false, error: 'Invalid or blocked URL' })
  }
  const ck = config.consumer_key as string
  const cs = config.consumer_secret as string
  const baseUrl = `${siteUrl}/wp-json/wc/v3`
  const authParams = `consumer_key=${ck}&consumer_secret=${cs}`

  if (functionName === 'search_product') {
    const limit = Math.min((args.limit as number) || 5, 20)
    let url = `${baseUrl}/products?search=${encodeURIComponent(args.query as string)}&per_page=${limit}&${authParams}`
    if (args.category_id) url += `&category=${args.category_id}`
    const res = await fetchWithTimeout(url)
    const products = await res.json()
    return JSON.stringify({
      products: (products || []).map((p: any) => ({
        id: String(p.id),
        name: p.name,
        description: p.short_description?.replace(/<[^>]*>/g, '').slice(0, 150) || '',
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price || null,
        in_stock: p.in_stock,
        stock_quantity: p.stock_quantity,
        image_url: p.images?.[0]?.src || null,
        categories: (p.categories || []).map((c: any) => c.name),
        on_sale: p.on_sale || false,
      })),
      total: (products || []).length,
    })
  }

  if (functionName === 'get_product_details') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}?${authParams}`)
    const p = await res.json()
    if (p.code) return JSON.stringify({ error: p.message || 'Product not found' })
    return JSON.stringify({
      id: String(p.id),
      name: p.name,
      description: p.description?.replace(/<[^>]*>/g, '').slice(0, 500) || '',
      short_description: p.short_description?.replace(/<[^>]*>/g, '') || '',
      price: p.price,
      regular_price: p.regular_price,
      sale_price: p.sale_price || null,
      on_sale: p.on_sale,
      in_stock: p.in_stock,
      stock_quantity: p.stock_quantity,
      categories: (p.categories || []).map((c: any) => ({ id: String(c.id), name: c.name })),
      images: (p.images || []).slice(0, 5).map((img: any) => img.src),
      attributes: (p.attributes || []).map((a: any) => ({ name: a.name, options: a.options })),
      variations_count: p.variations?.length || 0,
    })
  }

  if (functionName === 'check_stock') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}?${authParams}`)
    const p = await res.json()
    if (p.code) return JSON.stringify({ error: p.message || 'Product not found' })
    return JSON.stringify({
      id: String(p.id),
      name: p.name,
      price: p.price,
      in_stock: p.in_stock,
      stock_quantity: p.stock_quantity,
      stock_status: p.stock_status,
      manage_stock: p.manage_stock,
      backorders_allowed: p.backorders_allowed,
    })
  }

  if (functionName === 'get_order_status') {
    const res = await fetchWithTimeout(`${baseUrl}/orders/${args.order_id}?${authParams}`)
    const o = await res.json()
    if (o.code) return JSON.stringify({ error: o.message || 'Order not found' })
    return JSON.stringify({
      id: o.id,
      status: o.status,
      total: o.total,
      currency: o.currency,
      date: o.date_created,
      payment_method: o.payment_method_title,
      line_items: (o.line_items || []).slice(0, 10).map((li: any) => ({
        name: li.name, quantity: li.quantity, total: li.total,
      })),
      shipping: o.shipping ? {
        name: `${o.shipping.first_name} ${o.shipping.last_name}`.trim(),
        city: o.shipping.city,
        country: o.shipping.country,
      } : null,
    })
  }

  if (functionName === 'list_categories') {
    const limit = Math.min((args.limit as number) || 20, 100)
    const res = await fetchWithTimeout(`${baseUrl}/products/categories?per_page=${limit}&${authParams}`)
    const categories = await res.json()
    return JSON.stringify({
      categories: (categories || []).map((c: any) => ({
        id: String(c.id),
        name: c.name,
        slug: c.slug,
        count: c.count,
        parent_id: c.parent ? String(c.parent) : null,
      })),
      total: (categories || []).length,
    })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- Stripe ---
async function executeStripe(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const apiKey = config.api_key as string
  const defaultCurrency = (config.currency as string) || 'eur'
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }

  if (functionName === 'get_payment_status') {
    const res = await fetchWithTimeout(`https://api.stripe.com/v1/payment_intents/${args.payment_intent_id}`, { headers })
    const pi = await res.json()
    if (pi.error) return JSON.stringify({ error: pi.error.message })
    return JSON.stringify({
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      amount_formatted: `${(pi.amount / 100).toFixed(2)} ${(pi.currency || '').toUpperCase()}`,
      currency: pi.currency,
      payment_method: pi.payment_method_types?.[0] || null,
      created: new Date(pi.created * 1000).toISOString(),
      customer_email: pi.receipt_email || null,
    })
  }

  if (functionName === 'search_customer_payments') {
    // First find the customer by email
    const custRes = await fetchWithTimeout(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(args.customer_email as string)}&limit=1`,
      { headers }
    )
    const custData = await custRes.json()
    const customer = custData.data?.[0]
    if (!customer) return JSON.stringify({ found: false, customer_email: args.customer_email, payments: [] })

    const limit = Math.min((args.limit as number) || 5, 10)
    const piRes = await fetchWithTimeout(
      `https://api.stripe.com/v1/payment_intents?customer=${customer.id}&limit=${limit}`,
      { headers }
    )
    const piData = await piRes.json()
    return JSON.stringify({
      found: true,
      customer_email: args.customer_email,
      customer_name: customer.name || null,
      payments: (piData.data || []).map((pi: any) => ({
        id: pi.id,
        status: pi.status,
        amount: pi.amount,
        amount_formatted: `${(pi.amount / 100).toFixed(2)} ${(pi.currency || '').toUpperCase()}`,
        currency: pi.currency,
        created: new Date(pi.created * 1000).toISOString(),
        description: pi.description || null,
      })),
    })
  }

  if (functionName === 'create_payment_link') {
    const currency = (args.currency as string) || defaultCurrency
    const body = new URLSearchParams({
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][product_data][name]': args.description as string,
      'line_items[0][price_data][unit_amount]': String(args.amount_cents),
      'line_items[0][quantity]': '1',
    })
    const res = await fetchWithTimeout('https://api.stripe.com/v1/payment_links', {
      method: 'POST', headers, body: body.toString(),
    })
    const link = await res.json()
    if (link.error) return JSON.stringify({ error: link.error.message })
    const amountFormatted = `${((args.amount_cents as number) / 100).toFixed(2)} ${currency.toUpperCase()}`
    return JSON.stringify({ url: link.url, id: link.id, amount: amountFormatted })
  }

  if (functionName === 'get_balance') {
    const res = await fetchWithTimeout('https://api.stripe.com/v1/balance', { headers })
    const balance = await res.json()
    if (balance.error) return JSON.stringify({ error: balance.error.message })
    return JSON.stringify({
      available: (balance.available || []).map((b: any) => ({
        amount: b.amount,
        amount_formatted: `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`,
        currency: b.currency,
      })),
      pending: (balance.pending || []).map((b: any) => ({
        amount: b.amount,
        amount_formatted: `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`,
        currency: b.currency,
      })),
    })
  }

  if (functionName === 'list_recent_charges') {
    const limit = Math.min((args.limit as number) || 10, 25)
    const res = await fetchWithTimeout(`https://api.stripe.com/v1/charges?limit=${limit}`, { headers })
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })
    return JSON.stringify({
      charges: (data.data || []).map((c: any) => ({
        id: c.id,
        amount: c.amount,
        amount_formatted: `${(c.amount / 100).toFixed(2)} ${(c.currency || '').toUpperCase()}`,
        status: c.status,
        paid: c.paid,
        description: c.description || null,
        customer_email: c.receipt_email || c.billing_details?.email || null,
        created: new Date(c.created * 1000).toISOString(),
      })),
      total: (data.data || []).length,
    })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- Google Sheets ---
async function executeGoogleSheets(
  tool: AgentTool,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  credentialId?: string | null
): Promise<string> {
  const accessToken = await ensureValidAccessToken(tool, config, credentialId)
  const spreadsheetId = config.spreadsheet_id as string
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (functionName === 'list_sheets') {
    const res = await fetchWithTimeout(
      `${baseUrl}?fields=sheets.properties.title,sheets.properties.sheetId,sheets.properties.gridProperties`,
      { headers }
    )
    const data = await res.json()
    const sheets = (data.sheets || []).map((s: any) => ({
      name: s.properties.title,
      id: s.properties.sheetId,
      rows: s.properties.gridProperties?.rowCount || 0,
      columns: s.properties.gridProperties?.columnCount || 0,
    }))
    return JSON.stringify({ sheets, total: sheets.length })
  }

  if (functionName === 'read_range') {
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(args.range as string)}`,
      { headers }
    )
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })
    const values = data.values || []
    return JSON.stringify({ range: data.range, rows: values.length, columns: values[0]?.length || 0, values })
  }

  if (functionName === 'search') {
    // If no sheet_name, use default_sheet from config, then fallback to first sheet dynamically
    let sheetName: string = (args.sheet_name as string) || (config.default_sheet as string) || ''
    if (!sheetName) {
      const metaRes = await fetchWithTimeout(
        `${baseUrl}?fields=sheets.properties.title`,
        { headers }
      )
      const metaData = await metaRes.json()
      sheetName = metaData.sheets?.[0]?.properties?.title || 'Sheet1'
    }

    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(sheetName)}`,
      { headers }
    )
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message, hint: `Sheet "${sheetName}" not found. Call list_sheets first to get the correct sheet name.` })
    const rows = (data.values || []) as string[][]
    const query = (args.query as string).toLowerCase()
    const headerRow = rows[0] || []
    const matches = rows
      .map((row, i) => ({ row, index: i }))
      .filter(({ row }) => row.some(cell => String(cell).toLowerCase().includes(query)))
      .slice(0, 15)
    return JSON.stringify({
      query: args.query,
      sheet: sheetName,
      headers: headerRow,
      matches: matches.map(m => ({ row_number: m.index + 1, data: m.row })),
      total_matches: matches.length,
    })
  }

  if (functionName === 'write_row') {
    const sheetName = args.sheet_name as string
    const values = args.values as unknown[]
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
      { method: 'POST', headers, body: JSON.stringify({ values: [values] }) }
    )
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })
    return JSON.stringify({ appended: true, updatedRange: data.updates?.updatedRange, rows_added: 1 })
  }

  if (functionName === 'update_cell') {
    const range = args.range as string
    const values = args.values as unknown[]
    // Wrap in array if single value
    const body = Array.isArray(values[0]) ? { values } : { values: [values] }
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', headers, body: JSON.stringify(body) }
    )
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })
    return JSON.stringify({ updated: true, updatedRange: data.updatedRange, updatedCells: data.updatedCells })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- Gmail ---
async function executeGoogleGmail(
  tool: AgentTool,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  credentialId?: string | null
): Promise<string> {
  const accessToken = await ensureValidAccessToken(tool, config, credentialId)
  const baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me'
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (functionName === 'send_email') {
    const to = args.to as string
    const subject = args.subject as string
    const body = args.body as string
    const cc = args.cc as string | undefined
    const bcc = args.bcc as string | undefined
    const isHtml = args.is_html as boolean | undefined

    // Build RFC 2822 MIME message
    const mimeLines = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      Buffer.from(body).toString('base64'),
    ]
    const rawMessage = Buffer.from(mimeLines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const res = await fetchWithTimeout(`${baseUrl}/messages/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw: rawMessage }),
    })
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })
    return JSON.stringify({ sent: true, messageId: data.id, threadId: data.threadId, to, subject })
  }

  if (functionName === 'list_emails') {
    const query = args.query as string | undefined
    const maxResults = Math.min(Number(args.max_results) || 5, 10)
    const params = new URLSearchParams({ maxResults: String(maxResults) })
    if (query) params.set('q', query)

    const listRes = await fetchWithTimeout(`${baseUrl}/messages?${params}`, { headers })
    const listData = await listRes.json()
    if (listData.error) return JSON.stringify({ error: listData.error.message })

    const messages = listData.messages || []
    if (messages.length === 0) return JSON.stringify({ emails: [], count: 0 })

    // Fetch headers for each message
    const emails = await Promise.all(
      messages.slice(0, maxResults).map(async (msg: { id: string }) => {
        const msgRes = await fetchWithTimeout(
          `${baseUrl}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers }
        )
        const msgData = await msgRes.json()
        const hdrs = msgData.payload?.headers || []
        const getHeader = (name: string) => hdrs.find((h: { name: string; value: string }) => h.name === name)?.value || ''
        return {
          id: msg.id,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: msgData.snippet || '',
        }
      })
    )

    return JSON.stringify({ emails, count: emails.length, totalEstimate: listData.resultSizeEstimate })
  }

  if (functionName === 'read_email') {
    const emailId = args.email_id as string
    const res = await fetchWithTimeout(`${baseUrl}/messages/${emailId}?format=full`, { headers })
    const data = await res.json()
    if (data.error) return JSON.stringify({ error: data.error.message })

    const hdrs = data.payload?.headers || []
    const getHeader = (name: string) => hdrs.find((h: { name: string; value: string }) => h.name === name)?.value || ''

    // Extract body
    let bodyText = ''
    const parts = data.payload?.parts || [data.payload]
    for (const part of parts) {
      if (part?.mimeType === 'text/plain' && part.body?.data) {
        bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8')
        break
      }
      if (part?.mimeType === 'text/html' && part.body?.data && !bodyText) {
        bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }

    return JSON.stringify({
      id: emailId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: bodyText.slice(0, 5000),
    })
  }

  throw new Error(`Unknown Gmail function: ${functionName}`)
}

// --- WhatsApp Message ---
type WhatsAppContact = { name: string; phone: string }

async function executeWhatsAppMessage(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>,
  context?: { userId: string; agentId: string; conversationId?: string }
): Promise<string> {
  // Parse contacts from config
  let contacts: WhatsAppContact[] = []
  try {
    const raw = config.contacts as string
    contacts = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as WhatsAppContact[]) || []
  } catch {
    return JSON.stringify({ error: 'Invalid contacts configuration. Expected JSON array.' })
  }

  if (functionName === 'list_contacts') {
    return JSON.stringify({
      contacts: contacts.map(c => ({ name: c.name, phone: c.phone })),
      count: contacts.length,
    })
  }

  if (functionName === 'send_whatsapp') {
    const contactName = args.contact_name as string
    const message = args.message as string

    if (!message) return JSON.stringify({ error: 'Message is required' })

    // Find contact by name (case-insensitive)
    const contact = contacts.find(c => c.name.toLowerCase() === contactName?.toLowerCase())
    if (!contact) {
      return JSON.stringify({
        error: `Contact "${contactName}" not found. Available contacts: ${contacts.map(c => c.name).join(', ')}`,
      })
    }

    if (!context?.agentId) {
      return JSON.stringify({ error: 'Missing agent context' })
    }

    // Parse optional send delay (seconds) and session_id
    const sendDelay = Number(config.send_delay) || 0
    const sessionId = config.session_id as string | undefined

    // Call the internal WhatsApp send proxy
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const res = await fetchWithTimeout(`${baseUrl}/api/tools/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        agent_id: context.agentId,
        session_id: sessionId,
        contact_name: contact.name,
        phone_number: contact.phone,
        message,
        send_delay: sendDelay,
      }),
    })
    const data = await res.json()
    return JSON.stringify(data)
  }

  throw new Error(`Unknown WhatsApp function: ${functionName}`)
}

// --- Custom API ---
async function executeCustomTool(
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const baseUrl = config.base_url as string
  const authType = config.auth_type as string
  const functions = config.functions as Array<{
    name: string; method: string; endpoint: string; parameters: Array<{ name: string }>
  }> | undefined

  const fnDef = functions?.find(f => f.name === functionName)
  if (!fnDef) throw new Error(`Function ${functionName} not defined`)

  // Validate URL
  let url = `${baseUrl}${fnDef.endpoint}`
  // Replace path parameters like {product_id}
  for (const [key, value] of Object.entries(args)) {
    url = url.replace(`{${key}}`, encodeURIComponent(String(value)))
  }

  const urlCheck = validateToolUrl(url)
  if (!urlCheck.valid) throw new Error(urlCheck.error)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  // Auth
  if (authType === 'bearer') {
    headers['Authorization'] = `Bearer ${config.api_key || config.token}`
  } else if (authType === 'api_key') {
    const headerName = (config.api_key_header as string) || 'X-API-Key'
    headers[headerName] = config.api_key as string
  } else if (authType === 'basic') {
    // Support both username:password fields and api_key as "user:pass"
    const username = config.username || (config.api_key as string)?.split(':')[0]
    const password = config.password || (config.api_key as string)?.split(':').slice(1).join(':')
    if (username && password) {
      const creds = Buffer.from(`${username}:${password}`).toString('base64')
      headers['Authorization'] = `Basic ${creds}`
    }
  }

  // Add custom headers
  const customHeaders = config.headers as Record<string, string> | undefined
  if (customHeaders) Object.assign(headers, customHeaders)

  const method = (fnDef.method || 'GET').toUpperCase()
  const fetchOpts: RequestInit = { method, headers }

  if ((method === 'GET' || method === 'HEAD') && Object.keys(args).length > 0) {
    // Add remaining args as query string params (path params already replaced above)
    const urlObj = new URL(url)
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null && !url.includes(`/${encodeURIComponent(String(value))}`)) {
        urlObj.searchParams.set(key, String(value))
      }
    }
    url = urlObj.toString()
  } else if (method !== 'GET' && method !== 'HEAD' && Object.keys(args).length > 0) {
    fetchOpts.body = JSON.stringify(args)
  }

  const res = await fetchWithTimeout(url, fetchOpts)
  const text = await res.text()

  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text
  }
}

// ============================================================
// Helpers
// ============================================================

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function logExecution(
  supabase: ReturnType<typeof getAdminClient>,
  params: {
    userId: string
    agentId: string
    toolId: string
    conversationId?: string
    functionName: string
    parameters: Record<string, unknown>
    result: Record<string, unknown> | null
    status: string
    errorMessage: string | null
    durationMs: number
  }
) {
  const { error: logError } = await supabase.from('tool_execution_logs').insert({
    user_id: params.userId,
    agent_id: params.agentId,
    tool_id: params.toolId,
    conversation_id: params.conversationId || null,
    function_name: params.functionName,
    parameters: params.parameters,
    result: params.result,
    status: params.status,
    error_message: params.errorMessage,
    duration_ms: params.durationMs,
  })
  if (logError) {
    console.error('[Tools] logExecution insert error:', logError.message, '| convId:', params.conversationId, '| userId:', params.userId)
  }
}

// ============================================================
// Fetch active tools for an agent
// ============================================================

export async function getAgentTools(agentId: string): Promise<AgentTool[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)

  if (error) {
    console.error('[Tools] getAgentTools error:', error.message)
  }

  return (data || []) as AgentTool[]
}
