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
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Detect new account: created less than 15 seconds ago
      const createdAt = new Date(session.user.created_at).getTime()
      isNewOAuthUser = Date.now() - createdAt < 15_000

      // For new Google OAuth users: resolve referral_code cookie → referred_by
      const referralCookie = request.cookies.get('referral_code')?.value
      if (referralCookie) {
        const { data: profile } = await admin
          .from('profiles')
          .select('referred_by')
          .eq('id', session.user.id)
          .single() as { data: { referred_by: string | null } | null }

        if (!profile?.referred_by) {
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
