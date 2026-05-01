import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.autyvia.fr'

  const response = NextResponse.redirect(`${baseUrl}/sign-up`)
  response.cookies.set('referral_code', code.toUpperCase(), {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  })

  return response
}
