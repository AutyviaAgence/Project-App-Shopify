import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Use anon key (least privilege — tenants table has public read RLS)
let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _supabase
}

// In-memory cache with size limit to prevent memory exhaustion
const cache = new Map<string, { data: string; expiry: number }>()
const CACHE_TTL = 3600_000 // 1 hour
const MAX_CACHE_SIZE = 100

export const dynamic = 'force-dynamic'

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
  const supabase = getSupabase()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, app_name, logo_url, favicon_url, primary_color, accent_color, sidebar_color, bg_color, text_color, support_email, theme_config')
    .eq('domain', domain)
    .single()

  if (!tenant) {
    // Fallback to default tenant
    const { data: defaultTenant } = await supabase
      .from('tenants')
      .select('id, slug, app_name, logo_url, favicon_url, primary_color, accent_color, sidebar_color, bg_color, text_color, support_email, theme_config')
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
      slug: 'xeyo',
      appName: 'Xeyo',
      logoUrl: '/logo.svg',
      faviconUrl: null,
      primaryColor: '#7DC2A5',
      accentColor: '#40E9BE',
      sidebarColor: '#2D3E48',
      bgColor: null,
      textColor: null,
      supportEmail: null,
      themeConfig: null,
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
    bgColor: (tenant.bg_color as string) || null,
    textColor: (tenant.text_color as string) || null,
    supportEmail: (tenant.support_email as string) || null,
    themeConfig: (tenant.theme_config as Record<string, unknown>) || null,
  }
}

function cacheResult(domain: string, config: Record<string, unknown>) {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(domain, {
    data: JSON.stringify(config),
    expiry: Date.now() + CACHE_TTL,
  })
}
