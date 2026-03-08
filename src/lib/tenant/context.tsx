'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TENANT, type TenantConfig, type ThemePalette } from './types'

const TenantContext = createContext<TenantConfig>(DEFAULT_TENANT)

export function useTenant() {
  return useContext(TenantContext)
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(DEFAULT_TENANT)

  useEffect(() => {
    // Read tenant config from cookie set by middleware
    try {
      const cookies = document.cookie.split(';').map(c => c.trim())
      const tenantCookie = cookies.find(c => c.startsWith('x-tenant='))
      if (tenantCookie) {
        const value = decodeURIComponent(tenantCookie.split('=').slice(1).join('='))
        const parsed = JSON.parse(value) as TenantConfig
        if (parsed.slug) {
          // Sanitize color values to prevent CSS injection
          parsed.primaryColor = sanitizeColor(parsed.primaryColor) || DEFAULT_TENANT.primaryColor
          parsed.accentColor = sanitizeColor(parsed.accentColor) || DEFAULT_TENANT.accentColor
          parsed.sidebarColor = sanitizeColor(parsed.sidebarColor) || DEFAULT_TENANT.sidebarColor
          parsed.bgColor = sanitizeColor(parsed.bgColor) || null
          parsed.textColor = sanitizeColor(parsed.textColor) || null
          parsed.themeConfig = sanitizeThemeConfig(parsed.themeConfig)
          setTenant(parsed)
        }
      }
    } catch {
      // Keep default tenant
    }
  }, [])

  const cssVars = useMemo(() => buildCssVars(tenant), [tenant])

  return (
    <TenantContext.Provider value={tenant}>
      <style>{cssVars}</style>
      {children}
    </TenantContext.Provider>
  )
}

/** Build CSS variable overrides from tenant config */
function buildCssVars(tenant: TenantConfig): string {
  if (tenant.themeConfig) {
    // New system: per-theme colors
    const rules: string[] = []
    const { light, dark } = tenant.themeConfig

    if (light) {
      rules.push(`:root { ${paletteToVars(light, tenant)}; }`)
    }
    if (dark) {
      rules.push(`.dark { ${paletteToVars(dark, tenant)}; }`)
    }

    return rules.join('\n')
  }

  // Legacy fallback: single set of colors (bgColor/textColor)
  return `:root { ${buildLegacyVars(tenant)}; }`
}

/** Convert a ThemePalette to CSS variable declarations */
function paletteToVars(palette: ThemePalette, tenant: TenantConfig): string {
  const primary = palette.primary || tenant.primaryColor
  const accent = palette.accent || tenant.accentColor
  const sidebar = palette.sidebar || tenant.sidebarColor
  const bg = palette.background
  const fg = palette.foreground

  const vars: string[] = [
    `--primary: ${primary}`,
    `--accent: ${accent}`,
    `--autyvia-green: ${primary}`,
    `--autyvia-turquoise: ${accent}`,
    `--autyvia-turquoise-dark: ${adjustColor(accent, -20)}`,
    `--ring: ${primary}`,
    `--chart-1: ${primary}`,
    `--chart-2: ${accent}`,
    `--chart-3: ${adjustColor(primary, -15)}`,
    `--bubble-outgoing: ${primary}`,
    `--bubble-outgoing-text: #FFFFFF`,
    // Sidebar
    `--sidebar: ${sidebar}`,
    `--sidebar-primary: ${primary}`,
    `--sidebar-ring: ${primary}`,
    `--sidebar-accent: ${adjustColor(sidebar, 10)}`,
    `--sidebar-border: ${adjustColor(sidebar, 15)}`,
  ]

  if (bg) {
    const card = palette.card || adjustColor(bg, 8)
    const muted = palette.muted || adjustColor(bg, 12)
    const border = palette.border || adjustColor(bg, 18)

    vars.push(
      `--background: ${bg}`,
      `--card: ${card}`,
      `--popover: ${card}`,
      `--secondary: ${muted}`,
      `--muted: ${muted}`,
      `--border: ${border}`,
      `--input: ${border}`,
      `--bubble-incoming: ${adjustColor(bg, 12)}`,
      `--bubble-incoming-text: ${fg || '#F5F7FA'}`,
    )
  }

  if (fg) {
    vars.push(
      `--foreground: ${fg}`,
      `--card-foreground: ${fg}`,
      `--popover-foreground: ${fg}`,
      `--secondary-foreground: ${fg}`,
      `--accent-foreground: ${fg}`,
      `--muted-foreground: ${adjustColor(fg, -20)}`,
      `--sidebar-foreground: ${fg}`,
      `--sidebar-accent-foreground: ${fg}`,
    )
  }

  return vars.join('; ')
}

/** Legacy single-palette injection (for tenants without themeConfig) */
function buildLegacyVars(tenant: TenantConfig): string {
  const vars: string[] = [
    `--primary: ${tenant.primaryColor}`,
    `--accent: ${tenant.accentColor}`,
    `--sidebar: ${tenant.sidebarColor}`,
    `--autyvia-green: ${tenant.primaryColor}`,
    `--autyvia-turquoise: ${tenant.accentColor}`,
    `--autyvia-turquoise-dark: ${adjustColor(tenant.accentColor, -20)}`,
    `--ring: ${tenant.primaryColor}`,
    `--sidebar-primary: ${tenant.primaryColor}`,
    `--sidebar-ring: ${tenant.primaryColor}`,
    `--chart-1: ${tenant.primaryColor}`,
    `--chart-2: ${tenant.accentColor}`,
    `--chart-3: ${adjustColor(tenant.primaryColor, -15)}`,
    `--bubble-outgoing: ${tenant.primaryColor}`,
    `--bubble-outgoing-text: #FFFFFF`,
  ]

  if (tenant.bgColor) {
    vars.push(
      `--background: ${tenant.bgColor}`,
      `--card: ${adjustColor(tenant.bgColor, 8)}`,
      `--popover: ${adjustColor(tenant.bgColor, 8)}`,
      `--secondary: ${adjustColor(tenant.bgColor, 12)}`,
      `--muted: ${adjustColor(tenant.bgColor, 12)}`,
      `--border: ${adjustColor(tenant.bgColor, 18)}`,
      `--input: ${adjustColor(tenant.bgColor, 18)}`,
      `--sidebar: ${tenant.sidebarColor}`,
      `--sidebar-accent: ${adjustColor(tenant.sidebarColor, 10)}`,
      `--sidebar-border: ${adjustColor(tenant.sidebarColor, 15)}`,
      `--bubble-incoming: ${adjustColor(tenant.bgColor, 12)}`,
      `--bubble-incoming-text: ${tenant.textColor || '#F5F7FA'}`,
    )
  }

  if (tenant.textColor) {
    vars.push(
      `--foreground: ${tenant.textColor}`,
      `--card-foreground: ${tenant.textColor}`,
      `--popover-foreground: ${tenant.textColor}`,
      `--secondary-foreground: ${tenant.textColor}`,
      `--accent-foreground: ${tenant.textColor}`,
      `--muted-foreground: ${adjustColor(tenant.textColor, -20)}`,
      `--sidebar-foreground: ${tenant.textColor}`,
      `--sidebar-accent-foreground: ${tenant.textColor}`,
    )
  }

  return vars.join('; ')
}

/** Sanitize a ThemePalette object — validate all color fields */
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

/** Sanitize the full themeConfig object */
function sanitizeThemeConfig(config: TenantConfig['themeConfig']): TenantConfig['themeConfig'] {
  if (!config || typeof config !== 'object') return null
  const light = sanitizePalette(config.light)
  const dark = sanitizePalette(config.dark)
  if (!light && !dark) return null
  return { light, dark }
}

/** Validate hex color to prevent CSS injection */
function sanitizeColor(color: string | undefined | null): string | null {
  if (!color) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null
}

/** Lighten/darken a hex color by a percentage (-100 to +100) */
export function adjustColor(hex: string, percent: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * percent)))
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent)))
    const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(2.55 * percent)))
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  } catch {
    return hex
  }
}
