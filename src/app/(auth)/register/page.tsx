'use client'

import { useState, Suspense } from 'react'
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
  const [emailSent, setEmailSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!acceptedTerms) {
      toast.error(t('auth.accept_required'))
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
      },
    })

    if (error) {
      toast.error(error.message)
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
          <Button type="submit" className="w-full mt-2" disabled={loading || !acceptedTerms}>
            {loading ? t('auth.signing_up') : t('auth.sign_up')}
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
