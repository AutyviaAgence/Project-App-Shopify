'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/context'
import { useTenant } from '@/lib/tenant/context'

const TURNSTILE_SITE_KEY = '0x4AAAAAACxrGN3L2YWh3XHJ'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const tenant = useTenant()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (captchaReady && !captchaToken) {
      toast.error('Veuillez compléter la vérification de sécurité.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
      captchaToken: captchaToken || undefined,
    })

    if (error) {
      toast.error(error.message)
      resetCaptcha()
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
            </div>
            <CardTitle>{t('auth.email_sent')}</CardTitle>
            <CardDescription>
              {t('auth.email_sent_desc')}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:underline">
              {t('auth.back_to_login')}
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image src={tenant.logoUrl} alt={tenant.appName} width={64} height={64} className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('auth.forgot_title')}</CardTitle>
          <CardDescription>{t('auth.forgot_desc')}</CardDescription>
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
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-4">
            <div ref={turnstileRef} className="flex justify-center" />
            <Button type="submit" className="w-full" disabled={loading || !captchaOk}>
              {loading ? t('auth.sending') : t('auth.send_link')}
            </Button>
            <Link href="/login" className="text-sm text-muted-foreground hover:underline">
              {t('auth.back_to_login')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
