/**
 * Validates an external URL to prevent SSRF attacks.
 * Blocks private IPs, localhost, and non-HTTPS URLs.
 */
export function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') return false

    const hostname = parsed.hostname.toLowerCase()

    // Block localhost
    if (hostname === 'localhost' || hostname === '[::1]') return false

    // Block private IP ranges
    const parts = hostname.split('.')
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number)
      if (a === 127) return false // 127.0.0.0/8
      if (a === 10) return false  // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return false // 172.16.0.0/12
      if (a === 192 && b === 168) return false // 192.168.0.0/16
      if (a === 169 && b === 254) return false // 169.254.0.0/16
      if (a === 0) return false   // 0.0.0.0/8
    }

    return true
  } catch {
    return false
  }
}
