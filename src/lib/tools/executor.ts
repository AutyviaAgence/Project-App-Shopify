import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { validateToolUrl, truncateResponse, sanitizeParams } from './security'
import { TOOL_TEMPLATES, toOpenAIFunction, buildCustomFunctions, type ToolFunction } from './templates'
import { refreshAccessToken } from '@/lib/oauth/google'
import type { AgentTool } from '@/types/database'

const TOOL_TIMEOUT_MS = 10_000
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

export async function executeToolCall(
  tool: AgentTool,
  fn: ToolFunction,
  args: Record<string, unknown>,
  context: { userId: string; agentId: string; conversationId?: string }
): Promise<{ success: boolean; result: string; durationMs: number }> {
  const startTime = Date.now()
  const supabase = getAdminClient()
  const config = decryptToolConfig(tool.config)
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
      result = await executeTemplateTool(tool, tool.tool_type, config, fn.name, cleanArgs)
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
  config: Record<string, unknown>
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
  console.log(`[Tools] Refreshing OAuth token for tool ${tool.id}`)
  try {
    const tokens = await refreshAccessToken({ refreshToken, clientId, clientSecret })
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Update config in DB with new token
    const supabase = getAdminClient()
    const updatedConfig = encryptToolConfig({
      ...config,
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt,
    })

    await supabase
      .from('agent_tools')
      .update({ config: updatedConfig, updated_at: new Date().toISOString() })
      .eq('id', tool.id)

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
  args: Record<string, unknown>
): Promise<string> {
  switch (toolType) {
    case 'google_calendar':
      return executeGoogleCalendar(tool, config, functionName, args)
    case 'shopify':
      return executeShopify(config, functionName, args)
    case 'woocommerce':
      return executeWooCommerce(config, functionName, args)
    case 'stripe':
      return executeStripe(config, functionName, args)
    case 'google_sheets':
      return executeGoogleSheets(tool, config, functionName, args)
    default:
      throw new Error(`Unknown template: ${toolType}`)
  }
}

// --- Google Calendar ---
async function executeGoogleCalendar(
  tool: AgentTool,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const accessToken = await ensureValidAccessToken(tool, config)
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
  const shopUrl = (config.shop_url as string).replace(/\/$/, '')
  const token = config.access_token as string
  const baseUrl = `https://${shopUrl}/admin/api/2024-01`
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

  if (functionName === 'search_product') {
    const res = await fetchWithTimeout(`${baseUrl}/products.json?title=${encodeURIComponent(args.query as string)}&limit=5`, { headers })
    const data = await res.json()
    const products = (data.products || []).map((p: any) => ({
      id: p.id, title: p.title, price: p.variants?.[0]?.price, available: p.variants?.[0]?.inventory_quantity > 0,
      inventory: p.variants?.[0]?.inventory_quantity,
    }))
    return JSON.stringify({ products })
  }

  if (functionName === 'check_stock') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}.json`, { headers })
    const data = await res.json()
    const variants = (data.product?.variants || []).map((v: any) => ({
      title: v.title, price: v.price, available: v.inventory_quantity > 0, quantity: v.inventory_quantity,
    }))
    return JSON.stringify({ product: data.product?.title, variants })
  }

  if (functionName === 'get_order_status') {
    const orderNum = (args.order_number as string).replace('#', '')
    const res = await fetchWithTimeout(`${baseUrl}/orders.json?name=${orderNum}&status=any&limit=1`, { headers })
    const data = await res.json()
    const order = data.orders?.[0]
    if (!order) return JSON.stringify({ found: false, order_number: orderNum })
    return JSON.stringify({
      found: true, order_number: order.name, status: order.financial_status,
      fulfillment: order.fulfillment_status || 'unfulfilled', total: order.total_price, currency: order.currency,
    })
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
  const ck = config.consumer_key as string
  const cs = config.consumer_secret as string
  const baseUrl = `${siteUrl}/wp-json/wc/v3`
  const authParams = `consumer_key=${ck}&consumer_secret=${cs}`

  if (functionName === 'search_product') {
    const res = await fetchWithTimeout(`${baseUrl}/products?search=${encodeURIComponent(args.query as string)}&per_page=5&${authParams}`)
    const products = await res.json()
    return JSON.stringify((products || []).map((p: any) => ({
      id: p.id, name: p.name, price: p.price, in_stock: p.in_stock, stock_quantity: p.stock_quantity,
    })))
  }

  if (functionName === 'check_stock') {
    const res = await fetchWithTimeout(`${baseUrl}/products/${args.product_id}?${authParams}`)
    const p = await res.json()
    return JSON.stringify({ id: p.id, name: p.name, price: p.price, in_stock: p.in_stock, stock_quantity: p.stock_quantity })
  }

  if (functionName === 'get_order_status') {
    const res = await fetchWithTimeout(`${baseUrl}/orders/${args.order_id}?${authParams}`)
    const o = await res.json()
    return JSON.stringify({ id: o.id, status: o.status, total: o.total, currency: o.currency, date: o.date_created })
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
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }

  if (functionName === 'get_payment_status') {
    if (args.payment_intent_id) {
      const res = await fetchWithTimeout(`https://api.stripe.com/v1/payment_intents/${args.payment_intent_id}`, { headers })
      const pi = await res.json()
      return JSON.stringify({ id: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency })
    }
    if (args.customer_email) {
      const res = await fetchWithTimeout(
        `https://api.stripe.com/v1/payment_intents?limit=5`,
        { headers }
      )
      const data = await res.json()
      return JSON.stringify({ recent_payments: (data.data || []).slice(0, 5).map((pi: any) => ({
        id: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency, created: pi.created,
      }))})
    }
    return JSON.stringify({ error: 'Provide payment_intent_id or customer_email' })
  }

  if (functionName === 'create_payment_link') {
    const currency = (args.currency as string) || 'eur'
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
    return JSON.stringify({ url: link.url, id: link.id })
  }

  throw new Error(`Unknown function: ${functionName}`)
}

// --- Google Sheets ---
async function executeGoogleSheets(
  tool: AgentTool,
  config: Record<string, unknown>,
  functionName: string,
  args: Record<string, unknown>
): Promise<string> {
  const accessToken = await ensureValidAccessToken(tool, config)
  const spreadsheetId = config.spreadsheet_id as string
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (functionName === 'read_range') {
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(args.range as string)}`,
      { headers }
    )
    const data = await res.json()
    return JSON.stringify({ range: data.range, values: data.values || [] })
  }

  if (functionName === 'search') {
    const sheetName = (args.sheet_name as string) || 'Sheet1'
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(sheetName)}`,
      { headers }
    )
    const data = await res.json()
    const rows = (data.values || []) as string[][]
    const query = (args.query as string).toLowerCase()
    const matches = rows
      .map((row, i) => ({ row, index: i }))
      .filter(({ row }) => row.some(cell => String(cell).toLowerCase().includes(query)))
      .slice(0, 10)
    return JSON.stringify({ query: args.query, matches: matches.map(m => ({ row: m.index + 1, data: m.row })) })
  }

  if (functionName === 'write_row') {
    const sheetName = args.sheet_name as string
    const values = args.values as unknown[]
    const res = await fetchWithTimeout(
      `${baseUrl}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
      { method: 'POST', headers, body: JSON.stringify({ values: [values] }) }
    )
    const data = await res.json()
    return JSON.stringify({ appended: true, updatedRange: data.updates?.updatedRange })
  }

  throw new Error(`Unknown function: ${functionName}`)
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
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64')
    headers['Authorization'] = `Basic ${creds}`
  }

  // Add custom headers
  const customHeaders = config.headers as Record<string, string> | undefined
  if (customHeaders) Object.assign(headers, customHeaders)

  const method = (fnDef.method || 'GET').toUpperCase()
  const fetchOpts: RequestInit = { method, headers }

  if (method !== 'GET' && method !== 'HEAD' && Object.keys(args).length > 0) {
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
  await supabase.from('tool_execution_logs').insert({
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
}

// ============================================================
// Fetch active tools for an agent
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAgentTools(agentId: string, externalClient?: any): Promise<AgentTool[]> {
  const supabase = externalClient || getAdminClient()
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
