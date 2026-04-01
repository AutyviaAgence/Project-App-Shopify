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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

const TURNSTILE_SITE_KEY = '0x4AAAAAACxrGN3L2YWh3XHJ'

function RegisterForm() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReady, setCaptchaReady] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const captchaOk = captchaReady ? !!captchaToken : true

  function resetCaptcha() {
    setCaptchaToken(null)
    if (widgetIdRef.current && (window as any).turnstile) {
      ;(window as any).turnstile.reset(widgetIdRef.current)
    }
  }

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    function renderWidget() {
      if (turnstileRef.current && (window as any).turnstile && turnstileRef.current.children.length === 0) {
        widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => { setCaptchaToken(token); setCaptchaReady(true) },
          'expired-callback': () => setCaptchaToken(null),
          'error-callback': () => { setCaptchaReady(false) },
          theme: 'auto',
        })
        setCaptchaReady(true)
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

  // Re-render turnstile when ref is available (after emailSent toggle)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    if (!emailSent && turnstileRef.current && (window as any).turnstile) {
      if (turnstileRef.current.children.length === 0) {
        widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => { setCaptchaToken(token); setCaptchaReady(true) },
          'expired-callback': () => setCaptchaToken(null),
          'error-callback': () => { setCaptchaReady(false) },
          theme: 'auto',
        })
        setCaptchaReady(true)
      }
    }
  }, [emailSent])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!acceptedTerms) {
      toast.error(t('auth.accept_required'))
      return
    }

    if (captchaReady && !captchaToken) {
      toast.error('Veuillez compléter la vérification de sécurité.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, signup_domain: window.location.hostname },
        emailRedirectTo: `${window.location.origin}/login`,
        captchaToken: captchaToken || undefined,
      },
    })

    if (error) {
      toast.error(error.message)
      resetCaptcha()
      setLoading(false)
      return
    }

    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('auth.check_email')}</CardTitle>
          <CardDescription className="mt-2">
            {t('auth.confirmation_sent', { email })}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4 pt-2">
          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            {t('auth.back_to_login')}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
        </div>
        <CardTitle className="text-2xl font-bold">{t('auth.register')}</CardTitle>
        <CardDescription>{t('auth.register_desc', { appName: tenant.appName })}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('auth.full_name')}</Label>
            <Input
              id="fullName"
              type="text"
              placeholder={t('auth.name_placeholder')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
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
              placeholder={t('auth.min_chars')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {/* GDPR checkbox */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="terms"
              checked={acceptedTerms}
              onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
              disabled={loading}
            />
            <label
              htmlFor="terms"
              className="text-sm text-muted-foreground leading-tight cursor-pointer"
            >
              {t('auth.accept_terms')}{' '}
              <Link href="/cgu" className="text-primary hover:underline" target="_blank">
                {t('auth.terms_link')}
              </Link>{' '}
              &amp;{' '}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                {t('auth.privacy_link')}
              </Link>
            </label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-2">
          {/* Cloudflare Turnstile CAPTCHA */}
          <div ref={turnstileRef} className="flex justify-center" />

          <Button type="submit" className="w-full mt-2" disabled={loading || !acceptedTerms || !captchaOk || googleLoading}>
            {loading ? t('auth.signing_up') : t('auth.sign_up')}
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
            onClick={async () => {
              if (!acceptedTerms) {
                toast.error(t('auth.accept_required'))
                return
              }
              setGoogleLoading(true)
              const supabase = createClient()
              const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/auth/callback`,
                },
              })
              if (error) {
                toast.error(error.message)
                setGoogleLoading(false)
              }
            }}
            disabled={loading || googleLoading || !acceptedTerms}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {googleLoading ? t('auth.signing_in') : t('auth.google_signup')}
          </Button>

          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            {t('auth.already_account')}
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
