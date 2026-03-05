import type { AgentToolType } from '@/types/database'

/**
 * Tool function parameter definition (maps to OpenAI function calling schema)
 */
export type ToolFunctionParam = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  enum?: string[]
}

/**
 * Tool function definition (an action the tool can perform)
 */
export type ToolFunction = {
  name: string
  description: string
  parameters: ToolFunctionParam[]
  permission: 'read' | 'write'
}

/**
 * Auth configuration for a tool template
 */
export type ToolAuthConfig = {
  type: 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'consumer_keys'
  fields: { key: string; label: string; placeholder: string; secret: boolean }[]
  oauth_url?: string
}

/**
 * Template definition for a pre-configured tool
 */
export type ToolTemplate = {
  type: AgentToolType
  name: string
  description: string
  icon: string
  auth: ToolAuthConfig
  functions: ToolFunction[]
  base_url?: string
}

// ============================================================
// TEMPLATES
// ============================================================

export const TOOL_TEMPLATES: Record<Exclude<AgentToolType, 'custom'>, ToolTemplate> = {
  google_calendar: {
    type: 'google_calendar',
    name: 'Google Calendar',
    description: 'Check availability, create and cancel events',
    icon: 'calendar',
    auth: {
      type: 'oauth2',
      fields: [
        { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com', secret: false },
        { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
        { key: 'calendar_id', label: 'Calendar ID', placeholder: 'primary', secret: false },
      ],
      oauth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
    base_url: 'https://www.googleapis.com/calendar/v3',
    functions: [
      {
        name: 'check_availability',
        description: 'Check available time slots on a given date. Use this when someone asks about availability or free slots.',
        parameters: [
          { name: 'date', type: 'string', description: 'The date to check (YYYY-MM-DD format)', required: true },
          { name: 'duration_minutes', type: 'number', description: 'Duration of the slot in minutes (default 60)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'create_event',
        description: 'Create a calendar event / appointment. Always confirm with the user before creating.',
        parameters: [
          { name: 'title', type: 'string', description: 'Event title', required: true },
          { name: 'start_datetime', type: 'string', description: 'Start date and time (ISO 8601)', required: true },
          { name: 'end_datetime', type: 'string', description: 'End date and time (ISO 8601)', required: true },
          { name: 'attendee_email', type: 'string', description: 'Attendee email address', required: false },
          { name: 'description', type: 'string', description: 'Event description', required: false },
        ],
        permission: 'write',
      },
      {
        name: 'cancel_event',
        description: 'Cancel/delete a calendar event. IMPORTANT: You MUST first call check_availability to get the real event ID from the events list. Never guess or invent an event_id. Always confirm with the user before cancelling.',
        parameters: [
          { name: 'event_id', type: 'string', description: 'The real event ID obtained from check_availability response (e.g. "abc123xyz"). Never invent this value.', required: true },
        ],
        permission: 'write',
      },
    ],
  },

  shopify: {
    type: 'shopify',
    name: 'Shopify',
    description: 'Check stock, search products, get order status',
    icon: 'shopping-bag',
    auth: {
      type: 'api_key',
      fields: [
        { key: 'shop_url', label: 'Shop URL', placeholder: 'myshop.myshopify.com', secret: false },
        { key: 'access_token', label: 'Admin API Access Token', placeholder: 'shpat_...', secret: true },
      ],
    },
    functions: [
      {
        name: 'search_product',
        description: 'Search for a product by name or keyword',
        parameters: [
          { name: 'query', type: 'string', description: 'Product name or keyword to search', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'check_stock',
        description: 'Check if a specific product is in stock and its available quantity',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The Shopify product ID', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'get_order_status',
        description: 'Get the status of an order by order number',
        parameters: [
          { name: 'order_number', type: 'string', description: 'The order number (e.g. #1001)', required: true },
        ],
        permission: 'read',
      },
    ],
  },

  woocommerce: {
    type: 'woocommerce',
    name: 'WooCommerce',
    description: 'Check stock, search products, get order status',
    icon: 'shopping-cart',
    auth: {
      type: 'consumer_keys',
      fields: [
        { key: 'site_url', label: 'Site URL', placeholder: 'https://myshop.com', secret: false },
        { key: 'consumer_key', label: 'Consumer Key', placeholder: 'ck_...', secret: true },
        { key: 'consumer_secret', label: 'Consumer Secret', placeholder: 'cs_...', secret: true },
      ],
    },
    functions: [
      {
        name: 'search_product',
        description: 'Search for a product by name or keyword',
        parameters: [
          { name: 'query', type: 'string', description: 'Product name or keyword to search', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'check_stock',
        description: 'Check if a specific product is in stock',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The WooCommerce product ID', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'get_order_status',
        description: 'Get the status of an order',
        parameters: [
          { name: 'order_id', type: 'string', description: 'The order ID', required: true },
        ],
        permission: 'read',
      },
    ],
  },

  stripe: {
    type: 'stripe',
    name: 'Stripe',
    description: 'Check payment status, create payment links',
    icon: 'credit-card',
    auth: {
      type: 'api_key',
      fields: [
        { key: 'api_key', label: 'Restricted API Key', placeholder: 'rk_live_...', secret: true },
      ],
    },
    base_url: 'https://api.stripe.com/v1',
    functions: [
      {
        name: 'get_payment_status',
        description: 'Check the status of a payment by payment intent ID or customer email',
        parameters: [
          { name: 'payment_intent_id', type: 'string', description: 'The payment intent ID (pi_...)', required: false },
          { name: 'customer_email', type: 'string', description: 'Customer email to look up recent payments', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'create_payment_link',
        description: 'Create a payment link for a given amount. Always confirm with the user before creating.',
        parameters: [
          { name: 'amount_cents', type: 'number', description: 'Amount in cents (e.g. 5000 = 50€)', required: true },
          { name: 'description', type: 'string', description: 'Payment description', required: true },
          { name: 'currency', type: 'string', description: 'Currency code (default eur)', required: false },
        ],
        permission: 'write',
      },
    ],
  },

  google_sheets: {
    type: 'google_sheets',
    name: 'Google Sheets',
    description: 'Read, write and search data in Google Sheets',
    icon: 'table',
    auth: {
      type: 'oauth2',
      fields: [
        { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com', secret: false },
        { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
        { key: 'spreadsheet_id', label: 'Spreadsheet ID', placeholder: 'From the sheet URL', secret: false },
      ],
      oauth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
    base_url: 'https://sheets.googleapis.com/v4/spreadsheets',
    functions: [
      {
        name: 'read_range',
        description: 'Read data from a specific range in the spreadsheet',
        parameters: [
          { name: 'range', type: 'string', description: 'The A1 notation range (e.g. Sheet1!A1:D10)', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'search',
        description: 'Search for a value across the spreadsheet',
        parameters: [
          { name: 'query', type: 'string', description: 'The value to search for', required: true },
          { name: 'sheet_name', type: 'string', description: 'Sheet name to search in (default: first sheet)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'write_row',
        description: 'Append a new row to the spreadsheet. Always confirm with the user before writing.',
        parameters: [
          { name: 'sheet_name', type: 'string', description: 'Sheet name to write to', required: true },
          { name: 'values', type: 'array', description: 'Array of values for each column', required: true },
        ],
        permission: 'write',
      },
    ],
  },
}

/**
 * Convert a ToolFunction to OpenAI function calling format
 */
export function toOpenAIFunction(fn: ToolFunction, toolName: string) {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of fn.parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description,
      ...(param.enum ? { enum: param.enum } : {}),
    }
    if (param.required) required.push(param.name)
  }

  return {
    type: 'function' as const,
    function: {
      name: `${toolName}__${fn.name}`,
      description: fn.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  }
}

/**
 * Build custom tool functions from config
 */
export function buildCustomFunctions(config: Record<string, unknown>) {
  const functions = config.functions as Array<{
    name: string
    description: string
    method: string
    endpoint: string
    parameters: ToolFunctionParam[]
    permission: 'read' | 'write'
  }> | undefined

  if (!functions || !Array.isArray(functions)) return []

  return functions.map((fn) => ({
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters || [],
    permission: fn.permission || 'read' as const,
  }))
}
