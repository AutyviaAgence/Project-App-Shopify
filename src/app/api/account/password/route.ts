import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBrowserClient } from '@supabase/ssr'
import { checkRateLimit } from '@/lib/rate-limit'

/** POST /api/account/password — Changer le mot de passe */
export async function POST(req: NextRequest) {
  // Rate limiting strict — empêcher le brute-force du mot de passe actuel
  const rateLimitResponse = checkRateLimit(req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { currentPassword, newPassword } = body as {
    currentPassword: string
    newPassword: string
  }

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Mot de passe actuel et nouveau requis' },
      { status: 400 }
    )
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' },
      { status: 400 }
    )
  }

  // Vérifier le mot de passe actuel via un client isolé (sans cookies) pour ne pas
  // écraser la session active de l'utilisateur
  const verifyClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  })

  if (signInError) {
    return NextResponse.json(
      { error: 'Mot de passe actuel incorrect' },
      { status: 400 }
    )
  }

  // Mettre à jour le mot de passe via la session originale de l'utilisateur
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { success: true } })
}
