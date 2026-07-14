import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { getAuthedUser } from '@/lib/shopify/embedded-auth'

/**
 * POST /api/shopify/embedded/login-link
 *
 * Génère un lien de connexion à usage unique vers app.xeyo.io, pour le compte Xeyo
 * de la boutique. Le marchand arrive CONNECTÉ, sans saisir de mot de passe.
 *
 * ⚠️ POURQUOI CETTE ROUTE EXISTE.
 *
 * Avec le managed install, Shopify n'appelle JAMAIS notre callback OAuth : il ouvre
 * directement l'app embedded. Il n'existe donc aucun moment où l'on pourrait
 * rediriger le marchand vers app.xeyo.io *et l'y connecter*. Son compte Xeyo est
 * bien créé côté serveur (resolveXeyoUser), mais son navigateur n'a aucun cookie de
 * session : le renvoyer sur /onboarding le ferait atterrir sur la page de connexion,
 * face à un compte dont il ne connaît même pas le mot de passe (il n'en a jamais
 * choisi — l'inscription s'est faite toute seule).
 *
 * On génère donc un lien de connexion Supabase (magic link) et on l'ouvre.
 *
 * ⚠️ SÉCURITÉ : le lien n'est délivré qu'au porteur d'un session token Shopify
 * VALIDE (signature HMAC vérifiée) pour CETTE boutique. Il ouvre le compte Xeyo de
 * la boutique — soit exactement ce que l'appelant voit déjà dans l'app embedded.
 * Aucune élévation de privilège : quiconque peut appeler cette route a déjà accès
 * aux mêmes données via l'iframe.
 */
export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req)
  if (!authed || !authed.embedded) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('email, onboarding_completed_at')
    .eq('id', authed.userId)
    .maybeSingle()

  if (!profile?.email) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }

  // Onboarding non terminé → on l'y emmène. Sinon, le dashboard.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'
  const target = profile.onboarding_completed_at ? '/dashboard' : '/onboarding'

  // ⚠️ `redirectTo` DOIT passer par /auth/callback : c'est lui qui échange le jeton
  // contre une session (cookie). Pointer directement sur /onboarding renverrait le
  // marchand sur une page protégée SANS session → redirection vers la connexion,
  // et le lien magique n'aurait servi à rien.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
    options: { redirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(target)}` },
  })

  if (error || !data?.properties?.action_link) {
    console.error('[embedded/login-link] génération échouée :', error?.message)
    return NextResponse.json({ error: 'Lien de connexion indisponible' }, { status: 500 })
  }

  return NextResponse.json({ data: { url: data.properties.action_link, target } })
}
