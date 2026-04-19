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
    description: 'Search products, check stock, get order status, list collections',
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
        description: 'Search for products by name, keyword or collection. Returns product ID, title, price, stock, image URL and variants. Use this first when a customer asks about a product.',
        parameters: [
          { name: 'query', type: 'string', description: 'Product name or keyword to search', required: true },
          { name: 'limit', type: 'number', description: 'Max results to return (default 5, max 20)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'get_product_details',
        description: 'Get full details of a specific product including all variants, images, description and stock. IMPORTANT: You MUST first call search_product to get the real product ID. Never guess a product ID.',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The Shopify product ID obtained from search_product', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'check_stock',
        description: 'Check if a specific product is in stock and get available quantity per variant. IMPORTANT: You MUST first call search_product to get the real product ID.',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The Shopify product ID obtained from search_product', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'get_order_status',
        description: 'Get the status of a customer order by order number (e.g. #1001). Returns payment status, fulfillment status, tracking info and line items.',
        parameters: [
          { name: 'order_number', type: 'string', description: 'The order number (e.g. #1001 or 1001)', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'list_collections',
        description: 'List product collections/categories available in the shop. Useful when a customer asks about product categories.',
        parameters: [
          { name: 'limit', type: 'number', description: 'Max results (default 10)', required: false },
        ],
        permission: 'read',
      },
    ],
  },

  woocommerce: {
    type: 'woocommerce',
    name: 'WooCommerce',
    description: 'Search products, check stock, get order status, list categories',
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
        description: 'Search for products by name or keyword. Returns product ID, name, price, stock status, image and short description. Use this first when a customer asks about a product.',
        parameters: [
          { name: 'query', type: 'string', description: 'Product name or keyword to search', required: true },
          { name: 'category_id', type: 'string', description: 'Filter by category ID (get IDs from list_categories)', required: false },
          { name: 'limit', type: 'number', description: 'Max results (default 5, max 20)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'get_product_details',
        description: 'Get full details of a specific product including description, images, attributes, variations and stock. IMPORTANT: You MUST first call search_product to get the real product ID.',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The WooCommerce product ID obtained from search_product', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'check_stock',
        description: 'Check if a specific product is in stock and get available quantity. IMPORTANT: You MUST first call search_product to get the real product ID.',
        parameters: [
          { name: 'product_id', type: 'string', description: 'The WooCommerce product ID obtained from search_product', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'get_order_status',
        description: 'Get the status of a customer order by order ID. Returns payment status, shipping status, line items and tracking info.',
        parameters: [
          { name: 'order_id', type: 'string', description: 'The WooCommerce order ID', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'list_categories',
        description: 'List product categories available in the shop. Useful when a customer asks about product categories or to filter search results.',
        parameters: [
          { name: 'limit', type: 'number', description: 'Max results (default 20)', required: false },
        ],
        permission: 'read',
      },
    ],
  },

  stripe: {
    type: 'stripe',
    name: 'Stripe',
    description: 'Check payments, search customers, create payment links, list invoices',
    icon: 'credit-card',
    auth: {
      type: 'api_key',
      fields: [
        { key: 'api_key', label: 'Restricted API Key', placeholder: 'rk_live_...', secret: true },
        { key: 'currency', label: 'Default Currency', placeholder: 'eur', secret: false },
      ],
    },
    base_url: 'https://api.stripe.com/v1',
    functions: [
      {
        name: 'get_payment_status',
        description: 'Check the status of a payment by its Payment Intent ID (pi_...). Returns amount, status, payment method and customer info.',
        parameters: [
          { name: 'payment_intent_id', type: 'string', description: 'The payment intent ID (starts with pi_)', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'search_customer_payments',
        description: 'Search recent payments for a customer by their email address. Returns up to 10 most recent payment intents.',
        parameters: [
          { name: 'customer_email', type: 'string', description: 'Customer email address to search', required: true },
          { name: 'limit', type: 'number', description: 'Max results (default 5, max 10)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'create_payment_link',
        description: 'Create a one-time payment link for a given amount. The customer will receive a URL to pay. Always confirm the amount and description with the user before creating.',
        parameters: [
          { name: 'amount_cents', type: 'number', description: 'Amount in cents (e.g. 5000 = 50.00€, 1250 = 12.50€)', required: true },
          { name: 'description', type: 'string', description: 'Product or service description shown on payment page', required: true },
          { name: 'currency', type: 'string', description: 'Currency code: eur, usd, gbp, etc. (uses default if not set)', required: false },
        ],
        permission: 'write',
      },
      {
        name: 'get_balance',
        description: 'Get the current Stripe account balance. Shows available and pending amounts.',
        parameters: [],
        permission: 'read',
      },
      {
        name: 'list_recent_charges',
        description: 'List the most recent charges/payments. Useful for an overview of recent transactions.',
        parameters: [
          { name: 'limit', type: 'number', description: 'Number of charges to return (default 10, max 25)', required: false },
        ],
        permission: 'read',
      },
    ],
  },

  google_gmail: {
    type: 'google_gmail',
    name: 'Gmail',
    description: 'Send emails via Gmail. The AI can compose and send emails to specific recipients.',
    icon: 'mail',
    auth: {
      type: 'oauth2',
      fields: [
        { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com', secret: false },
        { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', secret: true },
      ],
      oauth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
    base_url: 'https://gmail.googleapis.com/gmail/v1',
    functions: [
      {
        name: 'send_email',
        description: 'Send an email to a recipient. Always confirm the recipient, subject and content with the user before sending.',
        parameters: [
          { name: 'to', type: 'string', description: 'Recipient email address', required: true },
          { name: 'subject', type: 'string', description: 'Email subject line', required: true },
          { name: 'body', type: 'string', description: 'Email body content (plain text or HTML)', required: true },
          { name: 'cc', type: 'string', description: 'CC email address (optional)', required: false },
          { name: 'bcc', type: 'string', description: 'BCC email address (optional)', required: false },
          { name: 'is_html', type: 'boolean', description: 'Set to true if body contains HTML (default: false)', required: false },
        ],
        permission: 'write',
      },
      {
        name: 'list_emails',
        description: 'List recent emails from the inbox. Use to check recent messages or find a specific email.',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query (e.g. "from:john@example.com" or "subject:invoice")', required: false },
          { name: 'max_results', type: 'number', description: 'Maximum number of emails to return (default: 5, max: 10)', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'read_email',
        description: 'Read the full content of a specific email by its ID. Use list_emails first to get the ID.',
        parameters: [
          { name: 'email_id', type: 'string', description: 'The email ID from list_emails', required: true },
        ],
        permission: 'read',
      },
    ],
  },

  google_sheets: {
    type: 'google_sheets',
    name: 'Google Sheets',
    description: 'Read, write, search and update data in Google Sheets',
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
        name: 'list_sheets',
        description: 'List all sheet tabs in the spreadsheet with their names. Call this first to know which sheets exist before reading or searching.',
        parameters: [],
        permission: 'read',
      },
      {
        name: 'read_range',
        description: 'Read data from a specific range in the spreadsheet. Use A1 notation. Call list_sheets first to get correct sheet names.',
        parameters: [
          { name: 'range', type: 'string', description: 'The A1 notation range (e.g. "Feuil1!A1:D10" or "Clients!A:C"). Use the exact sheet name from list_sheets.', required: true },
        ],
        permission: 'read',
      },
      {
        name: 'search',
        description: 'Search for a value across all cells of a sheet. Returns matching rows with their row numbers. Call list_sheets first to get the correct sheet name.',
        parameters: [
          { name: 'query', type: 'string', description: 'The value to search for (case-insensitive)', required: true },
          { name: 'sheet_name', type: 'string', description: 'Sheet name to search in. IMPORTANT: Use the exact name from list_sheets (e.g. "Feuil1", not "Sheet1")', required: false },
        ],
        permission: 'read',
      },
      {
        name: 'write_row',
        description: 'Append a new row at the end of a sheet. Always confirm the values with the user before writing. Call list_sheets first to get the correct sheet name.',
        parameters: [
          { name: 'sheet_name', type: 'string', description: 'Sheet name to append to (exact name from list_sheets)', required: true },
          { name: 'values', type: 'array', description: 'Array of values for each column, in order (e.g. ["John", "Doe", "john@email.com"])', required: true },
        ],
        permission: 'write',
      },
      {
        name: 'update_cell',
        description: 'Update a specific cell or range with new values. Always confirm with the user before updating. Call list_sheets first to get the correct sheet name.',
        parameters: [
          { name: 'range', type: 'string', description: 'The A1 notation cell or range to update (e.g. "Feuil1!B3" or "Clients!C5:D5")', required: true },
          { name: 'values', type: 'array', description: 'Array of values to write (single value for one cell, array for range)', required: true },
        ],
        permission: 'write',
      },
    ],
  },

  whatsapp_message: {
    type: 'whatsapp_message',
    name: 'WhatsApp Message',
    description: 'Send WhatsApp messages to pre-configured contacts (e.g. manager, support, warehouse).',
    icon: 'message-circle',
    auth: {
      type: 'api_key',
      fields: [
        { key: 'session_id', label: 'Session WhatsApp', placeholder: '', secret: false },
        { key: 'contacts', label: 'Contacts', placeholder: '[]', secret: false },
        { key: 'send_delay', label: 'Délai avant envoi (secondes)', placeholder: '0', secret: false },
      ],
    },
    functions: [
      {
        name: 'send_whatsapp',
        description: 'Send a WhatsApp message to a pre-configured contact. Always confirm the message and recipient with the user before sending.',
        parameters: [
          { name: 'contact_name', type: 'string', description: 'Name of the contact to send to (e.g. "Responsable", "Support"). Must match a configured contact.', required: true },
          { name: 'message', type: 'string', description: 'The message text to send', required: true },
        ],
        permission: 'write',
      },
      {
        name: 'list_contacts',
        description: 'List all available contacts that messages can be sent to.',
        parameters: [],
        permission: 'read',
      },
    ],
  },

  distance_calculator: {
    type: 'distance_calculator',
    name: 'Calculateur de distance & prix',
    description: 'Calcule la distance entre deux adresses et estime le prix selon une grille tarifaire kilométrique. Utilise OpenStreetMap (gratuit, sans clé API).',
    icon: 'map-pin',
    auth: {
      type: 'api_key',
      fields: [
        { key: 'price_per_km_base', label: 'Prix/km véhicule de base (€)', placeholder: '2.50', secret: false },
        { key: 'price_per_km_premium', label: 'Prix/km véhicule premium (€)', placeholder: '3.50', secret: false },
        { key: 'price_per_km_large', label: 'Prix/km grand véhicule (€)', placeholder: '4.50', secret: false },
        { key: 'minimum_price', label: 'Prix minimum (€)', placeholder: '120', secret: false },
        { key: 'night_surcharge', label: 'Supplément nuit % (ex: 15)', placeholder: '15', secret: false },
      ],
    },
    functions: [
      {
        name: 'calculate_price',
        description: 'Calcule la distance en km entre deux adresses et retourne le prix estimé pour chaque véhicule. Utilise ce tool AVANT de donner un prix au client.',
        parameters: [
          { name: 'origin', type: 'string', description: 'Adresse de départ (ex: "CDG Terminal 2, Paris", "Gare du Nord, Paris")', required: true },
          { name: 'destination', type: 'string', description: 'Adresse de destination (ex: "Tour Eiffel, Paris", "Versailles")', required: true },
          { name: 'night_trip', type: 'boolean', description: 'true si le trajet est entre 22h et 6h (supplément nuit)', required: false },
        ],
        permission: 'read',
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
