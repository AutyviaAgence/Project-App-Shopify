'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

const TURNSTILE_SITE_KEY = '0x4AAAAAACxrGN3L2YWh3XHJ'

function LoginForm() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function renderWidget() {
      if (turnstileRef.current && (window as any).turnstile && turnstileRef.current.children.length === 0) {
        ;(window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(null),
          theme: 'auto',
        })
      }
    }

    if (document.getElementById('cf-turnstile-script')) {
      renderWidget()
      return
    }
    const script = document.createElement('script')
    script.id = 'cf-turnstile-script'
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    script.onload = renderWidget
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    router.push(redirect || '/dashboard')
    router.refresh()
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
      },
    })
    if (error) {
      toast.error(error.message)
      setGoogleLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
        </div>
        <CardTitle className="text-2xl font-bold">{t('auth.login')}</CardTitle>
        <CardDescription>{t('auth.login_desc', { appName: tenant.appName })}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('auth.email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-2">
          <div ref={turnstileRef} className="flex justify-center" />
          <Button type="submit" className="w-full mt-2" disabled={loading || googleLoading || !captchaToken}>
            {loading ? t('auth.signing_in') : t('auth.sign_in')}
          </Button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('auth.or')}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {googleLoading ? t('auth.signing_in') : t('auth.google_login')}
          </Button>
          <div className="flex justify-between text-sm w-full">
            <Link href="/forgot-password" className="text-muted-foreground hover:underline">
              {t('auth.forgot_password')}
            </Link>
            <Link href="/register" className="text-muted-foreground hover:underline">
              {t('auth.no_account')}
            </Link>
          </div>
          {/* Legal links */}
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground pt-2 border-t w-full">
            <Link href="/cgu" className="hover:underline">{t('auth.terms')}</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:underline">{t('auth.privacy')}</Link>
            <span>•</span>
            <Link href="/legal" className="hover:underline">{t('auth.legal')}</Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
