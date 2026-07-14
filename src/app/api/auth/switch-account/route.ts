import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/auth/switch-account?redirect=/dashboard
 *
 * Déconnecte l'utilisateur courant, puis l'envoie sur la page de connexion.
 *
 * ⚠️ POURQUOI CETTE ROUTE EXISTE.
 *
 * Le middleware renvoie tout utilisateur DÉJÀ CONNECTÉ de `/login` vers
 * `/dashboard` (comportement voulu : on ne montre pas un formulaire de connexion à
 * quelqu'un de connecté). Conséquence : depuis l'app embedded, le bouton « Utiliser
 * un autre compte Xeyo » ramenait le marchand… sur son compte actuel. Il ne pouvait
 * donc JAMAIS en changer.
 *
 * On le déconnecte d'abord : il arrive sur un vrai formulaire de connexion et
 * choisit le compte qu'il veut.
 */
export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get('redirect') || '/dashboard'

  const supabase = await createClient()
  await supabase.auth.signOut()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  return NextResponse.redirect(`${appUrl}/login?redirect=${encodeURIComponent(redirect)}`)
}
