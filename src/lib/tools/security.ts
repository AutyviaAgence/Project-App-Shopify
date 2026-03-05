import 'server-only'

/**
 * Validate a URL for safety — block private IPs, localhost, non-HTTPS
 */
export function validateToolUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url)

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' }
    }

    const hostname = parsed.hostname.toLowerCase()

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return { valid: false, error: 'Localhost URLs are not allowed' }
    }

    // Block private IP ranges
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number)
      if (a === 10) return { valid: false, error: 'Private IP addresses are not allowed' }
      if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: 'Private IP addresses are not allowed' }
      if (a === 192 && b === 168) return { valid: false, error: 'Private IP addresses are not allowed' }
      if (a === 169 && b === 254) return { valid: false, error: 'Link-local addresses are not allowed' }
    }

    // Block internal hostnames
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { valid: false, error: 'Internal hostnames are not allowed' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Truncate API response to max size (default 50KB)
 */
export function truncateResponse(data: unknown, maxBytes: number = 50_000): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  if (str.length <= maxBytes) return str
  return str.slice(0, maxBytes) + '... [truncated]'
}

/**
 * Sanitize parameters — remove any keys that could be dangerous
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    // Skip internal/prototype keys
    if (key.startsWith('__') || key === 'constructor' || key === 'prototype') continue
    // Recursively sanitize objects (1 level deep)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeParams(value as Record<string, unknown>)
    } else {
      clean[key] = value
    }
  }
  return clean
}
