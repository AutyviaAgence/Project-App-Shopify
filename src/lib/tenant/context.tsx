'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_TENANT, type TenantConfig } from './types'

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
          setTenant(parsed)

          // Force dark mode when tenant has a dark background
          if (parsed.bgColor && isDarkColor(parsed.bgColor)) {
            document.documentElement.classList.add('dark')
            document.documentElement.style.colorScheme = 'dark'
          }
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
  ]

  // Message bubble colors — always set (derived from primary/accent)
  vars.push(
    `--bubble-outgoing: ${tenant.primaryColor}`,
    `--bubble-outgoing-text: #FFFFFF`,
  )

  // Extended branding: background + text color
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
      // Bubble colors for dark backgrounds
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

  return `:root { ${vars.join('; ')}; }`
}

/** Check if a hex color is dark (luminance < 50%) */
function isDarkColor(hex: string): boolean {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = (num >> 16) & 0xff
    const g = (num >> 8) & 0xff
    const b = num & 0xff
    // Relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5
  } catch {
    return false
  }
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
