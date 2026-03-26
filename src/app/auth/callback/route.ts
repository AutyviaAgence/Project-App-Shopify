import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /auth/callback — Handle OAuth callback from Supabase */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(redirect || '/dashboard', requestUrl.origin))
}
