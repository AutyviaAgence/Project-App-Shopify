'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SHOPIFY_APP_STORE_URL } from '@/lib/shopify/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'
import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthLegalFooter } from '@/components/auth-legal-footer'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAACxrGN3L2YWh3XHJ'

function LoginForm() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReady, setCaptchaReady] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const captchaOk = captchaReady ? !!captchaToken : true // if captcha never loaded, don't block

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
          // Widget en erreur → on ne bloque pas la connexion (captcha = bonus).
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } })

    if (error) {
      toast.error(error.message)
      resetCaptcha()
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
    <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
        </div>
        <CardTitle className="text-3xl font-bold">{t('auth.login')}</CardTitle>
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-2">
          <div ref={turnstileRef} className="flex justify-center" />
          <Button type="submit" className="w-full mt-2" disabled={loading || googleLoading || !captchaOk}>
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

          {/*
            « Continuer avec Shopify ».
            Shopify n'est PAS un fournisseur OAuth tiers : on ne peut pas s'y
            connecter comme avec Google. Le seul chemin conforme (exigence App
            Store 2.3.1 : l'installation doit partir d'une surface Shopify) est
            d'envoyer le marchand sur la fiche App Store. Il installe, Shopify
            nous le renvoie par OAuth, et `resolveXeyoUser()` crée ou rattache
            son compte Xeyo automatiquement — sans mot de passe à choisir.
            ⚠️ Ne JAMAIS remplacer ceci par un champ « votre boutique ».
          */}
          <a
            href={SHOPIFY_APP_STORE_URL}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15.34 3.5c-.1-.01-.2.02-.29.08-.04.03-.5.35-1.02.72-.53-1.53-1.47-2.93-3.12-2.93h-.15C10.3.72 9.7.4 9.16.4 5.03.4 3.06 5.56 2.44 8.19c-1.6.5-2.74.85-2.89.9-.9.28-.92.31-1.04 1.15L-3 22.7l13.1 2.45L21.9 22.6S15.47 3.66 15.34 3.5zM12.6 4.9l-1.7.53v-.36c0-1.07-.15-1.94-.39-2.63 1 .12 1.66 1.25 2.09 2.46zM9.5 2.63c.27.68.44 1.65.44 2.97v.19l-3.5 1.09C7.11 4.7 8.3 3.36 9.5 2.63zM8.4 1.5c.22 0 .43.07.62.21-1.58.75-3.28 2.63-4 6.38l-2.77.86C2.93 6.32 4.6 1.5 8.4 1.5z"
                fill="#95BF47"
              />
            </svg>
            Continuer avec Shopify
          </a>

          <div className="flex justify-between text-sm w-full">
            <Link href="/forgot-password" className="text-muted-foreground hover:underline">
              {t('auth.forgot_password')}
            </Link>
            <Link href="/register" className="text-muted-foreground hover:underline">
              {t('auth.no_account')}
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen bg-[#050505] lg:grid-cols-2">
      <AuthBrandPanel />
      <div className="relative flex flex-col items-center justify-center px-4 py-10">
        <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
          <LoginForm />
        </Suspense>
        <AuthLegalFooter />
      </div>
    </div>
  )
}
