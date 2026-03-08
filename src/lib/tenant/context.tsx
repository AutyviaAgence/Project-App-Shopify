'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
          setTenant(parsed)
        }
      }
    } catch {
      // Keep default tenant
    }
  }, [])

  return (
    <TenantContext.Provider value={tenant}>
      {/* Inject tenant CSS variables */}
      <style>{`
        :root {
          --primary: ${tenant.primaryColor};
          --accent: ${tenant.accentColor};
          --sidebar: ${tenant.sidebarColor};
          --autyvia-green: ${tenant.primaryColor};
          --autyvia-turquoise: ${tenant.accentColor};
          --autyvia-turquoise-dark: ${adjustColor(tenant.accentColor, -20)};
        }
      `}</style>
      {children}
    </TenantContext.Provider>
  )
}

/** Validate hex color to prevent CSS injection */
function sanitizeColor(color: string | undefined): string | null {
  if (!color) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null
}

/** Darken a hex color by a percentage */
function adjustColor(hex: string, percent: number): string {
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
