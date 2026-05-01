import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const cookieStore = await cookies()
  cookieStore.set('referral_code', code.toUpperCase(), {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax',
  })
  redirect('/sign-up')
}
