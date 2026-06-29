import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/update-password', '/shopify', '/cgu', '/cgv', '/privacy', '/legal', '/terms', '/data-deletion', '/auth/callback']
const AUTH_ROUTES = ['/login', '/register', '/forgot-password']

// Bump pour invalider tous les cookies tenant en cache (ex: changement de
// palette de thème). Un cookie sans cette version est régénéré depuis la DB.
const TENANT_COOKIE_VERSION = '3'

export async function middleware(request: NextRequest) {
  const { user, supabaseResponse } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Routes API et assets — laisser passer
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return supabaseResponse
  }

  // --- Tenant resolution via Host header ---
  const tenantCookie = request.cookies.get('x-tenant')
  const host = request.headers.get('host') || ''

  // Resolve tenant if no cookie or host changed
  if (!tenantCookie || !isTenantCookieValid(tenantCookie.value, host)) {
    try {
      const domain = host.split(':')[0] // strip port
      const tenantConfig = await resolveTenantDirect(domain)
      const cookieValue = JSON.stringify({ ...tenantConfig, _host: domain, _v: TENANT_COOKIE_VERSION })
      supabaseResponse.cookies.set('x-tenant', cookieValue, {
        path: '/',
        maxAge: 3600, // 1 hour
        httpOnly: false, // must stay false — TenantProvider reads via document.cookie (public theming data only)
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    } catch (err) {
      console.error('[Tenant] resolution failed:', err)
    }
  }

  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route))

  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route))

  // Non authentifié sur route protégée → login
  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authentifié sur route auth → dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

/** Check if the tenant cookie matches the current host AND the current version */
function isTenantCookieValid(cookieValue: string, host: string): boolean {
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue))
    return parsed._host === host.split(':')[0] && parsed._v === TENANT_COOKIE_VERSION
  } catch {
    return false
  }
}

const DEFAULT_TENANT = {
  id: '', slug: 'autyvia', appName: 'Autyvia', logoUrl: '/logo.svg',
  faviconUrl: null, primaryColor: '#40E9BE', accentColor: '#40E9BE',
  // Palette « Xeyo dark » (quasi-noir) par défaut.
  sidebarColor: '#0a0a0c', bgColor: null, textColor: null, supportEmail: null,
  themeConfig: null,
}

/** Resolve tenant by querying Supabase REST API directly (works in Edge Runtime) */
async function resolveTenantDirect(domain: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return DEFAULT_TENANT

  const columns = 'id,slug,app_name,logo_url,favicon_url,primary_color,accent_color,sidebar_color,bg_color,text_color,support_email,theme_config'

  // Try to find tenant by domain
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tenants?select=${columns}&domain=eq.${encodeURIComponent(domain)}&limit=1`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  )

  if (res.ok) {
    const rows = await res.json()
    if (rows.length > 0) return mapTenant(rows[0])
  }

  // Fallback: default tenant
  const fallback = await fetch(
    `${supabaseUrl}/rest/v1/tenants?select=${columns}&is_default=eq.true&limit=1`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  )

  if (fallback.ok) {
    const rows = await fallback.json()
    if (rows.length > 0) return mapTenant(rows[0])
  }

  return DEFAULT_TENANT
}

function mapTenant(t: Record<string, unknown>) {
  return {
    id: t.id as string,
    slug: t.slug as string,
    appName: t.app_name as string,
    logoUrl: t.logo_url as string,
    faviconUrl: (t.favicon_url as string) || null,
    primaryColor: t.primary_color as string,
    accentColor: t.accent_color as string,
    sidebarColor: t.sidebar_color as string,
    bgColor: (t.bg_color as string) || null,
    textColor: (t.text_color as string) || null,
    supportEmail: (t.support_email as string) || null,
    themeConfig: (t.theme_config as Record<string, unknown>) || null,
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
