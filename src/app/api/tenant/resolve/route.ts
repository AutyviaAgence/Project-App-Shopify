import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// In-memory cache to avoid hitting DB on every request
const cache = new Map<string, { data: string; expiry: number }>()
const CACHE_TTL = 3600_000 // 1 hour

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain')
  if (!domain) {
    return NextResponse.json({ error: 'domain required' }, { status: 400 })
  }

  // Check cache
  const cached = cache.get(domain)
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(JSON.parse(cached.data))
  }

  // Query DB
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, app_name, logo_url, favicon_url, primary_color, accent_color, sidebar_color, support_email')
    .eq('domain', domain)
    .single()

  if (!tenant) {
    // Fallback to default tenant
    const { data: defaultTenant } = await supabase
      .from('tenants')
      .select('id, slug, app_name, logo_url, favicon_url, primary_color, accent_color, sidebar_color, support_email')
      .eq('is_default', true)
      .single()

    const config = mapTenantConfig(defaultTenant)
    cacheResult(domain, config)
    return NextResponse.json(config)
  }

  const config = mapTenantConfig(tenant)
  cacheResult(domain, config)
  return NextResponse.json(config)
}

function mapTenantConfig(tenant: Record<string, unknown> | null) {
  if (!tenant) {
    return {
      id: '',
      slug: 'autyvia',
      appName: 'Autyvia',
      logoUrl: '/logo.svg',
      faviconUrl: null,
      primaryColor: '#7DC2A5',
      accentColor: '#40E9BE',
      sidebarColor: '#2D3E48',
      supportEmail: null,
    }
  }
  return {
    id: tenant.id as string,
    slug: tenant.slug as string,
    appName: tenant.app_name as string,
    logoUrl: tenant.logo_url as string,
    faviconUrl: (tenant.favicon_url as string) || null,
    primaryColor: tenant.primary_color as string,
    accentColor: tenant.accent_color as string,
    sidebarColor: tenant.sidebar_color as string,
    supportEmail: (tenant.support_email as string) || null,
  }
}

function cacheResult(domain: string, config: Record<string, unknown>) {
  cache.set(domain, {
    data: JSON.stringify(config),
    expiry: Date.now() + CACHE_TTL,
  })
}
