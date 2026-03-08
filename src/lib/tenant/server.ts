import { cookies } from 'next/headers'
import { DEFAULT_TENANT, type TenantConfig, type ThemePalette } from './types'

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
      bgColor: sanitizeColor(parsed.bgColor) || null,
      textColor: sanitizeColor(parsed.textColor) || null,
      supportEmail: parsed.supportEmail,
      themeConfig: sanitizeThemeConfig(parsed.themeConfig),
    }
  } catch {
    return DEFAULT_TENANT
  }
}

/** Validate that a color value is a safe hex color */
function sanitizeColor(color: string | undefined | null): string | null {
  if (!color) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null
}

function sanitizePalette(palette: ThemePalette | undefined | null): ThemePalette | undefined {
  if (!palette || typeof palette !== 'object') return undefined
  const clean: ThemePalette = {}
  const keys: (keyof ThemePalette)[] = ['primary', 'accent', 'sidebar', 'background', 'foreground', 'card', 'muted', 'border']
  for (const key of keys) {
    const val = sanitizeColor(palette[key])
    if (val) clean[key] = val
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

function sanitizeThemeConfig(config: TenantConfig['themeConfig']): TenantConfig['themeConfig'] {
  if (!config || typeof config !== 'object') return null
  const light = sanitizePalette(config.light)
  const dark = sanitizePalette(config.dark)
  if (!light && !dark) return null
  return { light, dark }
}
