import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// ⚠️ `/link` DOIT rester public — c'est la sortie du cercle vicieux.
//
// C'est la page où le marchand, venu de l'admin Shopify avec un jeton de liaison,
// rattache la boutique au compte de SON choix. Si elle était protégée :
//   · non connecté → le middleware le renverrait sur /login en PERDANT le jeton ;
//   · onboarding non terminé → le gate ci-dessous le renverrait sur /onboarding,
//     lequel réclame justement une boutique liée. Il ne pourrait jamais la lier.
// La page gère elle-même l'authentification (elle propose connexion ou inscription).
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/update-password', '/shopify', '/link', '/cgu', '/cgv', '/privacy', '/legal', '/terms', '/data-deletion', '/auth/callback']
const AUTH_ROUTES = ['/login', '/register', '/forgot-password']

// Bump pour invalider tous les cookies tenant en cache (ex: changement de
// palette de thème). Un cookie sans cette version est régénéré depuis la DB.
const TENANT_COOKIE_VERSION = '6'

export async function middleware(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request)
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

  // /register/complete (acceptation CGV post-OAuth) doit rester accessible
  // AUX UTILISATEURS AUTHENTIFIÉS — sinon startsWith('/register') les éjecte
  // vers le dashboard avant qu'ils aient pu accepter.
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route))
    && !pathname.startsWith('/register/complete')

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

  // IMPERSONATION : pas d'accès à l'admin tant qu'on agit « en tant que » un
  // client. On ne peut pas cumuler ses pouvoirs admin ET l'identité d'un
  // marchand — ce serait la porte à une élévation de privilège par erreur. Tant
  // que le cookie d'impersonation est posé, /admin renvoie au dashboard (du
  // client impersonné). Pour revenir à l'admin : « Revenir à mon compte » (la
  // bannière), qui efface le cookie.
  if (user && request.cookies.get('impersonate_uid') && pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // GRAND ONBOARDING (gate SERVEUR — fiable, pas de dépendance au JS client) :
  // un utilisateur authentifié qui n'a pas terminé l'onboarding est redirigé
  // vers /onboarding depuis toute page protégée. Fail-open sur erreur (jamais
  // de blocage si la colonne/ligne n'existe pas encore côté anciens tenants).
  if (
    user && !isPublicRoute &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/register/complete')
  ) {
    try {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('onboarding_completed_at, role')
        .eq('id', user.id)
        .maybeSingle()
      const p = prof as { onboarding_completed_at: string | null; role: string | null } | null
      if (!error && p && p.role !== 'admin' && !p.onboarding_completed_at) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    } catch { /* fail-open */ }
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
