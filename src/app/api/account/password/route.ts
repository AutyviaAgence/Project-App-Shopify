import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { blockIfImpersonating } from '@/lib/admin/impersonation'

/** POST /api/account/password — Changer le mot de passe */
export async function POST(req: NextRequest) {
  // Rate limiting strict — empêcher le brute-force
  const rateLimitResponse = checkRateLimit(req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

  // ⚠️ Jamais de changement de mot de passe en mode impersonation.
  const blocked = await blockIfImpersonating()
  if (blocked) return blocked

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

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Vérifier le mot de passe actuel via la service role key (bypass captcha)
  // On utilise le endpoint token avec la service_role key comme apikey
  const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({ email: user.email!, password: currentPassword }),
  })

  if (!verifyRes.ok) {
    return NextResponse.json(
      { error: 'Mot de passe actuel incorrect' },
      { status: 400 }
    )
  }

  // Mettre à jour le mot de passe via admin
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
