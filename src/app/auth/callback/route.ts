import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

/** GET /auth/callback — Handle OAuth callback from Supabase */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect')

  let isNewOAuthUser = false

  if (code) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    if (session?.user) {
      const isOAuth = session.user.app_metadata?.provider !== 'email'
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Fetch profile to check terms acceptance, referred_by and tenant_id
      const { data: profile } = await admin
        .from('profiles')
        .select('referred_by, terms_accepted_at, tenant_id')
        .eq('id', session.user.id)
        .single() as { data: { referred_by: string | null; terms_accepted_at: string | null; tenant_id: string | null } | null }

      // New OAuth user = OAuth login + never accepted terms
      if (isOAuth && !profile?.terms_accepted_at) {
        isNewOAuthUser = true
      }

      // Assign tenant_id for OAuth users who don't have one yet
      if (isOAuth && !profile?.tenant_id) {
        const host = requestUrl.hostname
        const { data: tenant } = await admin
          .from('tenants')
          .select('id')
          .or(`domain.eq.${host},is_default.eq.true`)
          .order('domain', { ascending: false }) // domain match wins over default
          .limit(1)
          .single() as { data: { id: string } | null }
        if (tenant) {
          await admin.from('profiles').update({ tenant_id: tenant.id }).eq('id', session.user.id)
        }
      }

      // For new Google OAuth users: resolve referral_code cookie → referred_by
      const referralCookie = request.cookies.get('referral_code')?.value
      if (referralCookie && !profile?.referred_by) {
        const { data: referrer } = await admin
          .from('profiles')
          .select('id')
          .eq('referral_code', referralCookie.toUpperCase())
          .single() as { data: { id: string } | null }

        if (referrer) {
          await admin
            .from('profiles')
            .update({ referred_by: referrer.id })
            .eq('id', session.user.id)
        }
      }
    }
  }

  // Use forwarded host (from Traefik/reverse proxy) or APP_URL to avoid 0.0.0.0
  const headersList = await headers()
  const forwardedHost = headersList.get('x-forwarded-host')
  const forwardedProto = headersList.get('x-forwarded-proto') || 'https'
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin

  // New OAuth users must accept CGV before accessing the app
  if (isNewOAuthUser && !redirect) {
    return NextResponse.redirect(new URL('/register/complete', origin))
  }

  // Validate redirect to prevent open redirect
  let redirectPath = '/dashboard'
  if (redirect) {
    if (redirect.startsWith('/') && !redirect.startsWith('//')) {
      redirectPath = redirect
    }
  }

  return NextResponse.redirect(new URL(redirectPath, origin))
}
