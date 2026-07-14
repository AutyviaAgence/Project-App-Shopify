import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

/** GET /auth/callback — Handle OAuth callback from Supabase */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect')

  // Lien de connexion à usage unique (magic link), utilisé pour ouvrir Xeyo depuis
  // l'app embedded Shopify : le marchand n'a jamais choisi de mot de passe (son
  // compte a été créé automatiquement à l'installation), et l'iframe ne lui pose
  // aucun cookie. Sans ce cas, il atterrirait sur la page de connexion.
  //
  // Selon la config Supabase, le lien revient soit en `?code=` (PKCE), soit en
  // `?token_hash=&type=` — on traite les DEUX plutôt que de parier sur l'un.
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const otpType = requestUrl.searchParams.get('type')
  if (tokenHash && otpType) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: otpType as 'magiclink' | 'email' | 'recovery' | 'invite',
      token_hash: tokenHash,
    })
    if (error) console.error('[auth/callback] verifyOtp échoué :', error.message)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
    return NextResponse.redirect(`${appUrl}${redirect || '/dashboard'}`)
  }

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
        // x-forwarded-host reflects the real entry domain (Xeyo, Autyvia, etc.) via Traefik
        const headersList = await headers()
        const forwardedHost = headersList.get('x-forwarded-host') || requestUrl.hostname

        // Try exact domain match first, fallback to default tenant
        const { data: tenantByDomain } = await admin
          .from('tenants')
          .select('id')
          .eq('domain', forwardedHost)
          .single() as { data: { id: string } | null }

        const tenantId = tenantByDomain?.id ?? (await admin
          .from('tenants')
          .select('id')
          .eq('is_default', true)
          .single() as { data: { id: string } | null }).data?.id

        if (tenantId) {
          await admin.from('profiles').update({ tenant_id: tenantId }).eq('id', session.user.id)
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
