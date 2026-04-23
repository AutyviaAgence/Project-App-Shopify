import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/auth/me — Vérifie si l'utilisateur est connecté */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user: { id: user.id, email: user.email } })
}
