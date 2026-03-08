import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/join', '/cgu', '/cgv', '/privacy', '/legal']
const AUTH_ROUTES = ['/login', '/register', '/forgot-password']

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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${host}`
      const resolveUrl = new URL('/api/tenant/resolve', appUrl)
      resolveUrl.searchParams.set('domain', host.split(':')[0]) // strip port

      const res = await fetch(resolveUrl.toString(), {
        headers: { 'x-middleware-internal': '1' },
      })

      if (res.ok) {
        const tenantConfig = await res.json()
        // Store in cookie with host for validation
        const cookieValue = JSON.stringify({ ...tenantConfig, _host: host.split(':')[0] })
        supabaseResponse.cookies.set('x-tenant', cookieValue, {
          path: '/',
          maxAge: 3600, // 1 hour
          httpOnly: false, // needs to be readable by client JS
          sameSite: 'lax',
        })
      }
    } catch {
      // Continue without tenant — will use defaults
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

/** Check if the tenant cookie matches the current host */
function isTenantCookieValid(cookieValue: string, host: string): boolean {
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue))
    return parsed._host === host.split(':')[0]
  } catch {
    return false
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
