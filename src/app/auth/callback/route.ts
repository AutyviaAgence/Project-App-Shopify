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

      // ── PARRAINAGE / AFFILIATION (inscription via Google) ──────────────────
      //
      // L'inscription par email passe par le trigger `handle_new_user`, qui lit
      // le code dans les métadonnées du compte. Google, lui, ne passe pas par ce
      // chemin : l'attribution doit être posée ici.
      //
      // ⚠️ Ce bloc cherchait le parrain dans `profiles.referral_code` — l'ancien
      // modèle. Il ne trouvait donc JAMAIS un code d'AFFILIÉ (qui vit dans une
      // autre table) : un partenaire perdait toute commission sur un filleul
      // inscrit via Google.
      const growthCookie = request.cookies.get('growth_code')?.value
      if (growthCookie) {
        try {
          const { data: code } = await admin
            .from('growth_codes')
            .select('id, owner_user_id, is_active')
            .ilike('code', growthCookie.trim())
            .maybeSingle() as { data: { id: string; owner_user_id: string | null; is_active: boolean } | null }

          // Anti auto-parrainage : on ne se parraine pas soi-même.
          const isSelf = code?.owner_user_id === session.user.id

          if (code?.is_active && !isSelf) {
            // `referee_id` est UNIQUE : un marchand n'est attribué qu'une fois, à
            // vie. Un doublon est donc normal (il s'était déjà inscrit) et ne doit
            // pas faire échouer la connexion.
            await admin
              .from('growth_attributions')
              .insert({ code_id: code.id, referee_id: session.user.id })
          }
        } catch (e) {
          // Une attribution ratée ne doit JAMAIS bloquer une connexion.
          console.error('[auth/callback] attribution échouée (non bloquant):', e)
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
