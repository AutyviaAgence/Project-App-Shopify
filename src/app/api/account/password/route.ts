import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // Vérifier le mot de passe actuel via l'API Supabase Auth directement (sans toucher aux cookies)
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ email: user.email!, password: currentPassword }),
  })

  if (!verifyRes.ok) {
    const errBody = await verifyRes.json().catch(() => ({}))
    console.error('[password] Supabase verify failed:', verifyRes.status, errBody)
    return NextResponse.json(
      { error: 'Mot de passe actuel incorrect' },
      { status: 400 }
    )
  }

  // Mettre à jour le mot de passe via le client admin (pas de contrainte de session)
  const admin = createAdminClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
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
