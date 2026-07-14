'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ShopifyAuthButton } from '@/components/shopify-auth-button'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import Script from 'next/script'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthLegalFooter } from '@/components/auth-legal-footer'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAACxrGN3L2YWh3XHJ'

// Widget Cloudflare Turnstile, injecté sur `window` par le script distant.
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (widgetId: string) => void
}
const turnstileApi = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile

function RegisterForm() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const refParam = searchParams.get('ref')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    const api = turnstileApi()
    if (widgetIdRef.current && api) {
      api.reset(widgetIdRef.current)
    }
  }

  useEffect(() => {
    if (refParam) {
      document.cookie = `affiliate_code=${refParam.toUpperCase()}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax`
    }
  }, [refParam])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    function renderWidget() {
      const api = turnstileApi()
      if (turnstileRef.current && api && turnstileRef.current.children.length === 0) {
        widgetIdRef.current = api.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => { setCaptchaToken(token); setCaptchaReady(true) },
          'expired-callback': () => setCaptchaToken(null),
          // Widget en erreur (ex: 110200 domaine non autorisé) → on NE bloque
          // PAS l'inscription : le captcha est une protection additionnelle,
          // pas un mur. captchaReady ne passe à true qu'à réception d'un token.
          'error-callback': () => { setCaptchaReady(false); setCaptchaToken(null) },
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

  // Re-render turnstile when ref is available (after emailSent toggle)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    const api = turnstileApi()
    if (!emailSent && turnstileRef.current && api) {
      if (turnstileRef.current.children.length === 0) {
        widgetIdRef.current = api.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => { setCaptchaToken(token); setCaptchaReady(true) },
          'expired-callback': () => setCaptchaToken(null),
          'error-callback': () => { setCaptchaReady(false); setCaptchaToken(null) },
          theme: 'auto',
        })
      }
    }
  }, [emailSent])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (captchaReady && !captchaToken) {
      toast.error('Veuillez compléter la vérification de sécurité.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const afterLogin = planParam
      ? `${window.location.origin}/subscription?plan=${planParam}`
      : `${window.location.origin}/login`
    const referralCode = document.cookie
      .split('; ')
      .find(r => r.startsWith('referral_code='))
      ?.split('=')[1]

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          // Le champ « Nom complet » a été retiré du formulaire (allègement de
          // l'inscription). On garde `full_name` : le trigger de création de
          // profil et /api/profile le lisent. Fallback = partie locale de l'email,
          // l'utilisateur pourra le corriger dans les paramètres.
          full_name: email.split('@')[0],
          signup_domain: window.location.hostname,
          ...(referralCode ? { referred_by_code: referralCode } : {}),
        },
        emailRedirectTo: afterLogin,
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
      <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
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
    <>
      {tenant.slug === 'xeyo' && (
        <>
          <Script
            id="meta-pixel-xeyo"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','2047096666153518');fbq('track','PageView');`,
            }}
          />
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img height="1" width="1" style={{ display: 'none' }} src="https://www.facebook.com/tr?id=2047096666153518&ev=PageView&noscript=1" alt="" />
          </noscript>
        </>
      )}
    <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
        </div>
        <CardTitle className="text-3xl font-bold">{t('auth.register')}</CardTitle>
        <CardDescription>{t('auth.register_desc', { appName: tenant.appName })}</CardDescription>
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.min_chars')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {/* Acceptation CGU + politique de confidentialité + traitement IA des
              messages : DÉPLACÉE vers le premier écran de l'onboarding
              (components/onboarding/welcome-screen.tsx) pour alléger ce
              formulaire. Le consentement reste obligatoire avant tout usage. */}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-2">
          {/* Cloudflare Turnstile CAPTCHA */}
          <div ref={turnstileRef} className="flex justify-center" />

          <Button type="submit" className="w-full mt-2" disabled={loading || !captchaOk || googleLoading}>
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
            disabled={loading || googleLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {googleLoading ? t('auth.signing_in') : t('auth.google_signup')}
          </Button>

          <ShopifyAuthButton label="Continuer avec Shopify" />

          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            {t('auth.already_account')}
          </Link>
        </CardFooter>
      </form>
    </Card>
    </>
  )
}

export default function RegisterPage() {
  return (
    <div className="grid min-h-screen bg-[#050505] lg:grid-cols-2">
      <AuthBrandPanel />
      <div className="relative flex flex-col items-center justify-center px-4 py-10">
        <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
          <RegisterForm />
        </Suspense>
        <AuthLegalFooter />
      </div>
    </div>
  )
}
