import { cookies } from 'next/headers'
import { DEFAULT_TENANT, type TenantConfig } from './types'

/**
 * Read tenant config from the x-tenant cookie (server-side).
 * Only used for cosmetic/branding purposes (product names in Stripe).
 * NEVER use this for authorization decisions — the cookie is attacker-controlled.
 * For auth decisions, resolve tenant from the user's profile.tenant_id in DB.
 */
export async function getTenantFromCookies(): Promise<TenantConfig> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('x-tenant')?.value
    if (!raw) return DEFAULT_TENANT
    const parsed = JSON.parse(decodeURIComponent(raw)) as TenantConfig
    // Only trust cosmetic fields, never use id for authorization
    if (!parsed.slug) return DEFAULT_TENANT
    return {
      ...DEFAULT_TENANT,
      slug: parsed.slug,
      appName: parsed.appName || DEFAULT_TENANT.appName,
      logoUrl: parsed.logoUrl || DEFAULT_TENANT.logoUrl,
      faviconUrl: parsed.faviconUrl,
      primaryColor: sanitizeColor(parsed.primaryColor) || DEFAULT_TENANT.primaryColor,
      accentColor: sanitizeColor(parsed.accentColor) || DEFAULT_TENANT.accentColor,
      sidebarColor: sanitizeColor(parsed.sidebarColor) || DEFAULT_TENANT.sidebarColor,
      supportEmail: parsed.supportEmail,
    }
  } catch {
    return DEFAULT_TENANT
  }
}

/** Validate that a color value is a safe hex color */
function sanitizeColor(color: string | undefined): string | null {
  if (!color) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null
}
